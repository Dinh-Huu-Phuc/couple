begin;

create table private.admin_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  credential_version text not null check (length(credential_version) = 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);
create table private.admin_login_attempts (
  singleton boolean primary key default true check (singleton),
  failures integer not null default 0,
  window_started_at timestamptz not null default now()
);
insert into private.admin_login_attempts(singleton) values(true);
alter table private.admin_sessions enable row level security;
alter table private.admin_login_attempts enable row level security;
revoke all on private.admin_sessions, private.admin_login_attempts from public, anon, authenticated;

-- These RPCs are only for the trusted server. No app JWT can mint a session.
create function api.admin_login_attempt(p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempt private.admin_login_attempts;
begin
  select * into v_attempt from private.admin_login_attempts where singleton for update;
  if p_success then
    update private.admin_login_attempts set failures=0, window_started_at=clock_timestamp() where singleton;
    return true;
  end if;
  if v_attempt.window_started_at < clock_timestamp() - interval '15 minutes' then
    update private.admin_login_attempts set failures=1, window_started_at=clock_timestamp() where singleton;
    return true;
  end if;
  update private.admin_login_attempts set failures=failures+1 where singleton;
  return v_attempt.failures < 5;
end;
$$;
create function api.admin_session_create(p_token_hash text, p_credential_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.admin_sessions where expires_at <= clock_timestamp();
  insert into private.admin_sessions(token_hash,credential_version) values(p_token_hash,p_credential_version);
end;
$$;
create function api.admin_session_valid(p_token_hash text, p_credential_version text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.admin_sessions where token_hash=p_token_hash
    and credential_version=p_credential_version and expires_at > statement_timestamp());
$$;
create function api.admin_session_revoke(p_token_hash text)
returns void language sql security definer set search_path = '' as $$
  delete from private.admin_sessions where token_hash=p_token_hash;
$$;

-- Close the old email-only access, including direct Storage downloads.
drop policy deleted_data_admin_read on storage.objects;
create or replace function api.admin_access()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('ok',true,'data',jsonb_build_object('allowed',false));
$$;
do $$ declare v_definition text; v_function regprocedure; begin
  foreach v_function in array array['api.admin_deleted_data(timestamptz,uuid,text)'::regprocedure,'api.admin_deleted_detail(uuid)'::regprocedure] loop
    v_definition := pg_get_functiondef(v_function);
    if strpos(v_definition,'if not private.is_admin() then') = 0 then raise exception 'unexpected admin RPC definition'; end if;
    execute replace(v_definition,'if not private.is_admin() then', 'if auth.role() is distinct from ''service_role'' then');
  end loop;
end $$;
revoke all on function api.admin_deleted_data(timestamptz,uuid,text), api.admin_deleted_detail(uuid),
  api.admin_login_attempt(boolean), api.admin_session_create(text,text), api.admin_session_valid(text,text), api.admin_session_revoke(text)
from public, anon, authenticated;
grant execute on function api.admin_deleted_data(timestamptz,uuid,text), api.admin_deleted_detail(uuid),
  api.admin_login_attempt(boolean), api.admin_session_create(text,text), api.admin_session_valid(text,text), api.admin_session_revoke(text)
to service_role;

commit;
