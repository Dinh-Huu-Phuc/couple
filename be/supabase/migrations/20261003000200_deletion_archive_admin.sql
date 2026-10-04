begin;

-- History is a separate, physically deletable row for each participant.
create table private.connection_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  couple_id uuid not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  person_id uuid not null,
  display_name text,
  created_at timestamptz not null,
  ended_at timestamptz not null,
  unique (owner_id, request_id)
);
create index connection_history_owner_date on private.connection_history(owner_id, created_at desc, id desc);

create table private.admin_accounts (
  email text primary key check (email = lower(btrim(email)))
);
insert into private.admin_accounts(email) values ('phucgp74@gmail.com');

create table private.deleted_data (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('connection', 'account')),
  source_user_id uuid not null,
  email text,
  display_name text,
  payload jsonb not null,
  files jsonb not null default '[]'::jsonb,
  status text not null check (status in ('pending', 'files_ready', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index deleted_data_one_account on private.deleted_data(source_user_id) where kind = 'account';
create index deleted_data_date on private.deleted_data(created_at desc, id desc);
alter table private.connection_history enable row level security;
alter table private.admin_accounts enable row level security;
alter table private.deleted_data enable row level security;
revoke all on private.connection_history, private.admin_accounts, private.deleted_data from public, anon, authenticated;

create function private.account_available(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.profiles p on p.id = u.id where u.id = p_user)
    and not exists (select 1 from private.deleted_data a where a.kind = 'account' and a.source_user_id = p_user);
$$;
create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join private.admin_accounts a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and private.account_available(u.id)
  );
$$;

create function private.capture_ended_connection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and old.status = 'active' then
    insert into private.connection_history(owner_id, request_id, couple_id, direction, person_id, display_name, created_at, ended_at)
    select ci.created_by, cr.id, new.id, 'incoming', cr.requester_id, p.display_name, cr.created_at, new.ended_at
    from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = cr.requester_id where cr.accepted_couple_id = new.id
    union all
    select cr.requester_id, cr.id, new.id, 'outgoing', ci.created_by, p.display_name, cr.created_at, new.ended_at
    from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = ci.created_by where cr.accepted_couple_id = new.id
    on conflict (owner_id, request_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger couples_capture_ended_connection after update on public.couples
for each row execute function private.capture_ended_connection();

-- Backfill existing disconnected couples once. Deletion never re-creates a row.
insert into private.connection_history(owner_id, request_id, couple_id, direction, person_id, display_name, created_at, ended_at)
select ci.created_by, cr.id, c.id, 'incoming', cr.requester_id, p.display_name, cr.created_at, c.ended_at
from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
join public.couples c on c.id = cr.accepted_couple_id and c.status = 'ended'
join public.profiles p on p.id = cr.requester_id
union all
select cr.requester_id, cr.id, c.id, 'outgoing', ci.created_by, p.display_name, cr.created_at, c.ended_at
from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
join public.couples c on c.id = cr.accepted_couple_id and c.status = 'ended'
join public.profiles p on p.id = ci.created_by;

create or replace function private.list_connection_requests_impl(p_limit integer, p_before timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  with rows as (
    select cr.id, cr.created_at, 'incoming' as direction, jsonb_build_object(
      'id', cr.id, 'status', cr.status, 'createdAt', cr.created_at, 'canDelete', false,
      'requester', jsonb_build_object('id', p.id, 'displayName', p.display_name)) as item
    from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = cr.requester_id
    where ci.created_by = v_actor and (cr.status <> 'accepted' or exists (
      select 1 from public.couples c where c.id = cr.accepted_couple_id and c.status = 'active'))
    union all
    select cr.id, cr.created_at, 'outgoing', jsonb_build_object(
      'id', cr.id, 'status', cr.status, 'createdAt', cr.created_at, 'canDelete', false,
      'inviter', jsonb_build_object('id', p.id, 'displayName', p.display_name))
    from private.connection_requests cr join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = ci.created_by
    where cr.requester_id = v_actor and (cr.status <> 'accepted' or exists (
      select 1 from public.couples c where c.id = cr.accepted_couple_id and c.status = 'active'))
    union all
    select h.id, h.created_at, h.direction, jsonb_build_object(
      'id', h.id, 'status', 'ended', 'createdAt', h.created_at, 'endedAt', h.ended_at, 'canDelete', true,
      case when h.direction = 'incoming' then 'requester' else 'inviter' end,
      jsonb_build_object('id', h.person_id, 'displayName', h.display_name))
    from private.connection_history h where h.owner_id = v_actor
  )
  select
    coalesce((select jsonb_agg(x.item order by x.created_at desc, x.id desc) from
      (select * from rows where direction = 'incoming' and (p_before is null or created_at < p_before)
       order by created_at desc, id desc limit v_limit) x), '[]'::jsonb),
    coalesce((select jsonb_agg(x.item order by x.created_at desc, x.id desc) from
      (select * from rows where direction = 'outgoing' and (p_before is null or created_at < p_before)
       order by created_at desc, id desc limit v_limit) x), '[]'::jsonb)
  into v_incoming, v_outgoing;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('incoming', v_incoming, 'outgoing', v_outgoing));
end;
$$;

create function private.delete_connection_history_impl(p_history_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row private.connection_history; v_actor uuid := auth.uid();
begin
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  select * into v_row from private.connection_history where id = p_history_id and owner_id = v_actor for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  insert into private.deleted_data(kind, source_user_id, email, display_name, payload, status, completed_at)
  select 'connection', v_actor, u.email, p.display_name, to_jsonb(v_row), 'completed', statement_timestamp()
  from auth.users u join public.profiles p on p.id = u.id where u.id = v_actor;
  delete from private.connection_history where id = v_row.id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_row.id));
end;
$$;
create function api.delete_connection_history(p_history_id uuid)
returns jsonb language sql set search_path = '' as $$ select private.delete_connection_history_impl(p_history_id); $$;

-- Once deletion is requested, existing JWTs cannot mutate application data.
create function private.guard_deleting_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and not private.account_available(auth.uid()) then
    raise exception using errcode = '42501', message = 'account deletion in progress';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
do $$ declare v_table text; begin
  foreach v_table in array array['public.profiles', 'public.couples', 'public.couple_members', 'public.wishes', 'public.draws', 'public.memories', 'private.couple_invites', 'private.connection_requests'] loop
    execute format('create trigger guard_deleting_actor before insert or update or delete on %s for each row execute function private.guard_deleting_actor()', v_table);
  end loop;
end $$;
create or replace function private.is_active_couple_member(p_couple_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.account_available(p_user_id) and exists (
    select 1 from public.couple_members cm join public.couples c on c.id = cm.couple_id
    where cm.couple_id = p_couple_id and cm.user_id = p_user_id and cm.left_at is null and c.status = 'active');
$$;
drop policy wishes_select_author on public.wishes;
create policy wishes_select_author on public.wishes for select to authenticated
using (author_id = (select auth.uid()) and private.account_available((select auth.uid())));

-- Only the backend service role can prepare deletion, after re-authentication.
create function api.prepare_account_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_archive private.deleted_data;
  v_couples uuid[];
  v_draws uuid[];
  v_archive_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_files jsonb;
begin
  -- Profile locks use the same order as connection approval, then couple locks.
  perform 1 from public.profiles p where p.id = p_user_id or p.id in (
    select cm.user_id from public.couple_members cm where cm.couple_id in (
      select mine.couple_id from public.couple_members mine where mine.user_id = p_user_id)) order by p.id for update;
  select * into v_archive from private.deleted_data where kind = 'account' and source_user_id = p_user_id;
  if found then return to_jsonb(v_archive); end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'account not found'; end if;
  select coalesce(array_agg(cm.couple_id), '{}'::uuid[]) into v_couples from public.couple_members cm where cm.user_id = p_user_id;
  perform 1 from public.couples c where c.id = any(v_couples) order by c.id for update;
  select coalesce(array_agg(d.id), '{}'::uuid[]) into v_draws from public.draws d where
    d.drawn_by = p_user_id or d.wish_id in (select w.id from public.wishes w where w.author_id = p_user_id)
    or d.id in (select m.draw_id from public.memories m where m.created_by = p_user_id);
  select jsonb_build_object(
    'schemaVersion', 1,
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'createdAt', u.created_at, 'emailConfirmedAt', u.email_confirmed_at) from auth.users u where u.id = p_user_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id),
    'couples', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.couples c where c.id = any(v_couples)),
    'members', (select coalesce(jsonb_agg(to_jsonb(cm)), '[]') from public.couple_members cm where cm.couple_id = any(v_couples)),
    'wishes', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.wishes w where w.author_id = p_user_id),
    'draws', (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from public.draws d where d.id = any(v_draws)),
    'memories', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.memories m where m.draw_id = any(v_draws)),
    'invites', (select coalesce(jsonb_agg(to_jsonb(ci) - 'token_hash'), '[]') from private.couple_invites ci where ci.created_by = p_user_id),
    'requests', (select coalesce(jsonb_agg(to_jsonb(cr)), '[]') from private.connection_requests cr where cr.requester_id = p_user_id or cr.invite_id in (select ci.id from private.couple_invites ci where ci.created_by = p_user_id)),
    'history', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from private.connection_history h where h.owner_id = p_user_id)
  ) into v_payload;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', s.bucket_id, 'name', s.name,
    'archiveKey', v_archive_id::text || '/' || s.id::text,
    'metadata', s.metadata) order by s.bucket_id, s.name), '[]') into v_files
  from storage.objects s where s.owner_id = p_user_id::text or s.owner = p_user_id
    or (s.bucket_id = 'couple-memories' and (s.name in (
      select m.photo_storage_key from public.memories m where m.draw_id = any(v_draws))
      or split_part(s.name, '/', 2) = any(select d::text from unnest(v_draws) d)));
  -- End the live pair before installing the write guard marker.
  update public.draws set status = 'cancelled', resolved_at = statement_timestamp()
    where couple_id = any(v_couples) and status in ('opened', 'accepted', 'discuss');
  update public.couple_members set left_at = statement_timestamp() where couple_id = any(v_couples) and left_at is null;
  update public.couples set status = 'ended', ended_at = statement_timestamp() where id = any(v_couples) and status = 'active';
  update private.couple_invites set status = 'revoked' where created_by = p_user_id and status = 'active';
  update private.connection_requests set status = 'cancelled', resolved_at = statement_timestamp()
    where status = 'pending' and (requester_id = p_user_id or invite_id in (select id from private.couple_invites where created_by = p_user_id));
  v_payload := jsonb_set(v_payload, '{history}', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from private.connection_history h where h.owner_id = p_user_id));
  insert into private.deleted_data(id, kind, source_user_id, email, display_name, payload, files, status)
  select v_archive_id, 'account', p_user_id, u.email, p.display_name, v_payload, v_files, 'pending'
  from auth.users u join public.profiles p on p.id = u.id where u.id = p_user_id returning * into v_archive;
  return to_jsonb(v_archive);
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit)
values ('deleted-data', 'deleted-data', false, 52428800);
create policy deleted_data_admin_read on storage.objects for select to authenticated
using (bucket_id = 'deleted-data' and private.is_admin());

create function api.mark_deletion_files_ready(p_archive_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_archive private.deleted_data; v_file jsonb;
begin
  select * into strict v_archive from private.deleted_data where id = p_archive_id and kind = 'account' for update;
  for v_file in select value from jsonb_array_elements(v_archive.files) loop
    if not exists (select 1 from storage.objects where bucket_id = 'deleted-data' and name = v_file->>'archiveKey')
       or exists (select 1 from storage.objects where bucket_id = v_file->>'bucket' and name = v_file->>'name') then
      raise exception 'photo archive incomplete';
    end if;
  end loop;
  if exists (select 1 from storage.objects where owner_id = v_archive.source_user_id::text or owner = v_archive.source_user_id) then
    raise exception 'account still owns storage objects';
  end if;
  update private.deleted_data set status = 'files_ready' where id = p_archive_id and status = 'pending';
end;
$$;

-- Auth Admin deletion and relational purge commit together; no half-deleted DB.
create function private.archive_before_auth_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_archive private.deleted_data; v_draws uuid[];
begin
  select * into v_archive from private.deleted_data where kind = 'account' and source_user_id = old.id for update;
  if not found or v_archive.status <> 'files_ready' then
    raise exception 'use the account deletion workflow to archive data first';
  end if;
  select coalesce(array_agg((x->>'id')::uuid), '{}'::uuid[]) into v_draws from jsonb_array_elements(v_archive.payload->'draws') x;
  delete from public.memories where draw_id = any(v_draws) or created_by = old.id;
  delete from public.draws where id = any(v_draws);
  delete from public.wishes where author_id = old.id;
  delete from private.connection_requests where requester_id = old.id or invite_id in (select id from private.couple_invites where created_by = old.id);
  delete from private.couple_invites where created_by = old.id;
  delete from public.couple_members where user_id = old.id;
  delete from private.connection_history where owner_id = old.id;
  update private.deleted_data set status = 'completed', completed_at = statement_timestamp() where id = v_archive.id;
  return old;
end;
$$;
create trigger archive_before_auth_delete before delete on auth.users
for each row execute function private.archive_before_auth_delete();

create function api.admin_access()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('ok', true, 'data', jsonb_build_object('allowed', private.is_admin()));
$$;
create function api.admin_deleted_data(p_before timestamptz default null, p_before_id uuid default null, p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if not private.is_admin() then return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED')); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]') into v_rows from (
    select id, kind, source_user_id, email, display_name, status, created_at, completed_at, jsonb_array_length(files) as photo_count
    from private.deleted_data where (p_kind is null or kind = p_kind)
      and (p_before is null or (created_at, id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by created_at desc, id desc limit 20
  ) x;
  return jsonb_build_object('ok', true, 'data', v_rows);
end;
$$;
create function api.admin_deleted_detail(p_archive_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_row jsonb;
begin
  if not private.is_admin() then return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED')); end if;
  select to_jsonb(a) into v_row from private.deleted_data a where a.id = p_archive_id;
  if v_row is null then return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED')); end if;
  return jsonb_build_object('ok', true, 'data', v_row);
end;
$$;

-- Keep the existing context but expose a resumable deletion state.
alter function private.get_my_context_impl() rename to get_my_context_before_deletion;
create function private.get_my_context_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  v_result := private.get_my_context_before_deletion();
  return jsonb_set(v_result, '{data,deletionPending}', to_jsonb(not private.account_available(auth.uid())));
end;
$$;
-- SQL functions bind to the previous function OID, so replace the wrapper.
create or replace function api.get_my_context()
returns jsonb language sql stable set search_path = '' as $$ select private.get_my_context_impl(); $$;

revoke all on function private.account_available(uuid), private.is_admin(), private.capture_ended_connection(),
  private.delete_connection_history_impl(uuid), private.guard_deleting_actor(), private.archive_before_auth_delete(),
  private.get_my_context_before_deletion(), private.get_my_context_impl() from public, anon, authenticated;
revoke all on function api.prepare_account_deletion(uuid), api.mark_deletion_files_ready(uuid),
  api.delete_connection_history(uuid), api.admin_access(), api.admin_deleted_data(timestamptz, uuid, text), api.admin_deleted_detail(uuid) from public, anon, authenticated;
grant execute on function private.account_available(uuid), private.is_admin(), private.delete_connection_history_impl(uuid),
  private.get_my_context_impl() to authenticated;
grant execute on function api.delete_connection_history(uuid), api.admin_access(), api.admin_deleted_data(timestamptz, uuid, text), api.admin_deleted_detail(uuid) to authenticated;
grant usage on schema api to service_role;
grant execute on function api.prepare_account_deletion(uuid), api.mark_deletion_files_ready(uuid) to service_role;

commit;
