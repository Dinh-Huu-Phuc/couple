begin;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('bug', 'feature', 'support')),
  title text not null check (title = btrim(title) and char_length(title) between 5 and 120),
  body text not null check (body = btrim(body) and char_length(body) between 10 and 4000),
  reply_email text not null check (
    reply_email = lower(btrim(reply_email)) and char_length(reply_email) between 3 and 254
    and reply_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved')),
  admin_reply text check (
    admin_reply is null or (admin_reply = btrim(admin_reply) and char_length(admin_reply) between 1 and 4000)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index feedback_user_created_idx on public.feedback (user_id, created_at desc, id desc);
create index feedback_status_created_idx on public.feedback (status, created_at desc, id desc);
create trigger feedback_set_updated_at before update on public.feedback
for each row execute function private.set_updated_at();

alter table public.feedback enable row level security;
create policy feedback_select_own on public.feedback for select to authenticated
using (user_id = (select auth.uid()) and private.account_available((select auth.uid())));

create function private.create_feedback_impl(
  p_request_id uuid, p_type text, p_title text, p_body text, p_reply_email text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_email text := lower(btrim(coalesce(p_reply_email, '')));
  v_hash text;
  v_existing_hash text;
  v_id uuid;
  v_row jsonb;
  v_allowed boolean;
  v_retry integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  if p_request_id is null or p_type not in ('bug', 'feature', 'support')
    or char_length(v_title) not between 5 and 120
    or char_length(v_body) not between 10 and 4000
    or char_length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_hash := private.sha256_text(jsonb_build_object(
    'type', p_type, 'title', v_title, 'body', v_body, 'replyEmail', v_email
  )::text);
  select i.payload_hash, i.result_id into v_existing_hash, v_id
  from private.idempotency_requests i
  where i.actor_id = v_actor and i.action = 'create_feedback' and i.request_id = p_request_id;
  if found then
    if v_existing_hash <> v_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT'));
    end if;
    select to_jsonb(f) into v_row from public.feedback f where f.id = v_id and f.user_id = v_actor;
    return jsonb_build_object('ok', true, 'data', v_row);
  end if;

  select allowed, retry_after_seconds into v_allowed, v_retry
  from private.consume_rate_limit(v_actor, 'create_feedback', 5, 3600);
  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'RATE_LIMITED', 'retryAfterSeconds', v_retry
    ));
  end if;

  insert into public.feedback (user_id, type, title, body, reply_email)
  values (v_actor, p_type, v_title, v_body, v_email)
  returning id, to_jsonb(feedback) into v_id, v_row;
  insert into private.idempotency_requests (actor_id, action, request_id, payload_hash, result_id)
  values (v_actor, 'create_feedback', p_request_id, v_hash, v_id);
  return jsonb_build_object('ok', true, 'data', v_row);
end;
$$;

create function private.list_my_feedback_impl(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_rows jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  if p_limit not between 1 and 50 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  into v_rows from (
    select f.id, f.type, f.title, f.body, f.reply_email, f.status,
      f.admin_reply, f.created_at, f.updated_at, f.reviewed_at
    from public.feedback f where f.user_id = v_actor
    order by f.created_at desc, f.id desc limit p_limit
  ) x;
  return jsonb_build_object('ok', true, 'data', v_rows);
end;
$$;

create function api.create_feedback(
  p_request_id uuid, p_type text, p_title text, p_body text, p_reply_email text
)
returns jsonb language sql set search_path = '' as $$
  select private.create_feedback_impl(p_request_id, p_type, p_title, p_body, p_reply_email);
$$;
create function api.list_my_feedback(p_limit integer default 20)
returns jsonb language sql stable set search_path = '' as $$
  select private.list_my_feedback_impl(p_limit);
$$;

create function api.admin_feedback(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if p_status is not null and p_status not in ('new', 'reviewing', 'resolved') then raise exception 'invalid status'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  into v_rows from (
    select f.id, f.type, f.title, f.body, f.reply_email, f.status,
      f.admin_reply, f.created_at, f.updated_at, f.reviewed_at
    from public.feedback f where p_status is null or f.status = p_status
    order by f.created_at desc, f.id desc limit 100
  ) x;
  return v_rows;
end;
$$;

create function api.admin_update_feedback(p_id uuid, p_status text, p_admin_reply text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_reply text := nullif(btrim(coalesce(p_admin_reply, '')), '');
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if p_status not in ('new', 'reviewing', 'resolved')
    or (v_reply is not null and char_length(v_reply) > 4000) then raise exception 'invalid feedback update'; end if;
  update public.feedback set status = p_status, admin_reply = v_reply,
    reviewed_at = case when p_status = 'new' then null else statement_timestamp() end
  where id = p_id returning to_jsonb(feedback) into v_row;
  if v_row is null then raise exception 'feedback not found'; end if;
  return v_row;
end;
$$;

revoke all on public.feedback from public, anon, authenticated;
revoke execute on function private.create_feedback_impl(uuid,text,text,text,text),
  private.list_my_feedback_impl(integer), api.create_feedback(uuid,text,text,text,text),
  api.list_my_feedback(integer), api.admin_feedback(text), api.admin_update_feedback(uuid,text,text)
from public, anon, authenticated;
grant execute on function private.create_feedback_impl(uuid,text,text,text,text),
  private.list_my_feedback_impl(integer), api.create_feedback(uuid,text,text,text,text),
  api.list_my_feedback(integer) to authenticated;
grant execute on function api.admin_feedback(text), api.admin_update_feedback(uuid,text,text) to service_role;

commit;
