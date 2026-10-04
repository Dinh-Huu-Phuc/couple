begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists api;

revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon;
grant usage on schema api to authenticated;

revoke create on schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 50
    )
  ),
  constraint profiles_timezone_check check (char_length(timezone) between 1 and 100)
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  anniversary_date date,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint couples_status_check check (status in ('active', 'ended')),
  constraint couples_status_ended_at_check check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create table public.couple_members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint couple_members_couple_user_key unique (couple_id, user_id),
  constraint couple_members_left_at_check check (left_at is null or left_at >= joined_at)
);

create unique index couple_members_one_active_per_user_idx
on public.couple_members (user_id)
where left_at is null;

create index couple_members_couple_id_idx on public.couple_members (couple_id);

create function private.enforce_couple_cardinality()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
  v_status text;
  v_active_members integer;
begin
  if tg_table_name = 'couples' then
    v_couple_id := coalesce(new.id, old.id);
  else
    v_couple_id := coalesce(new.couple_id, old.couple_id);
  end if;

  select c.status
  into v_status
  from public.couples c
  where c.id = v_couple_id;

  if not found then
    return null;
  end if;

  select count(*)::integer
  into v_active_members
  from public.couple_members cm
  where cm.couple_id = v_couple_id
    and cm.left_at is null;

  if v_status = 'active' and v_active_members <> 2 then
    raise exception using
      errcode = '23514',
      message = 'active couple must have exactly two active members';
  end if;

  if v_status = 'ended' and v_active_members <> 0 then
    raise exception using
      errcode = '23514',
      message = 'ended couple cannot have active members';
  end if;

  return null;
end;
$$;

create constraint trigger couples_cardinality_check
after insert or update or delete on public.couples
deferrable initially deferred
for each row execute function private.enforce_couple_cardinality();

create constraint trigger couple_members_cardinality_check
after insert or update or delete on public.couple_members
deferrable initially deferred
for each row execute function private.enforce_couple_cardinality();

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null,
  author_id uuid not null,
  title text not null,
  description text not null default '',
  category text not null,
  budget_vnd bigint,
  status text not null default 'active',
  available_from timestamptz,
  expires_at timestamptz,
  eligible_after timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishes_id_couple_key unique (id, couple_id),
  constraint wishes_member_fk foreign key (couple_id, author_id)
    references public.couple_members(couple_id, user_id) on delete restrict,
  constraint wishes_title_check check (
    title = btrim(title) and char_length(title) between 1 and 120
  ),
  constraint wishes_description_check check (char_length(description) <= 2000),
  constraint wishes_category_check check (
    category in ('food', 'gift', 'date', 'care', 'experience', 'other')
  ),
  constraint wishes_budget_check check (budget_vnd between 0 and 1000000000),
  constraint wishes_status_check check (
    status in ('active', 'paused', 'fulfilled', 'archived')
  ),
  constraint wishes_time_range_check check (
    available_from is null or expires_at is null or expires_at > available_from
  ),
  constraint wishes_version_check check (version > 0)
);

create trigger wishes_set_updated_at
before update on public.wishes
for each row execute function private.set_updated_at();

create index wishes_couple_author_status_idx
on public.wishes (couple_id, author_id, status);

create index wishes_author_created_idx
on public.wishes (author_id, created_at desc, id);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null,
  wish_id uuid not null,
  drawn_by uuid not null,
  status text not null default 'opened',
  request_id uuid not null,
  snapshot jsonb not null,
  drawn_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  resolved_at timestamptz,
  constraint draws_member_fk foreign key (couple_id, drawn_by)
    references public.couple_members(couple_id, user_id) on delete restrict,
  constraint draws_wish_fk foreign key (wish_id, couple_id)
    references public.wishes(id, couple_id) on delete restrict,
  constraint draws_actor_request_key unique (drawn_by, request_id),
  constraint draws_status_check check (
    status in ('opened', 'accepted', 'discuss', 'deferred', 'completed', 'cancelled')
  ),
  constraint draws_snapshot_check check (jsonb_typeof(snapshot) = 'object'),
  constraint draws_accepted_at_check check (
    (status in ('accepted', 'completed') and accepted_at is not null)
    or status not in ('accepted', 'completed')
  ),
  constraint draws_completed_at_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint draws_resolved_at_check check (
    (status in ('deferred', 'completed', 'cancelled') and resolved_at is not null)
    or (status in ('opened', 'accepted', 'discuss') and resolved_at is null)
  )
);

create unique index draws_one_open_per_wish_idx
on public.draws (wish_id)
where status in ('opened', 'accepted', 'discuss');

create unique index draws_one_open_per_actor_idx
on public.draws (couple_id, drawn_by)
where status in ('opened', 'accepted', 'discuss');

create index draws_couple_drawn_at_idx
on public.draws (couple_id, drawn_at desc, id);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null unique references public.draws(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  message text not null default '',
  photo_storage_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memories_message_check check (char_length(message) <= 1000),
  constraint memories_content_check check (
    char_length(btrim(message)) > 0 or photo_storage_key is not null
  ),
  constraint memories_photo_key_check check (
    photo_storage_key is null or char_length(photo_storage_key) between 1 and 500
  )
);

create trigger memories_set_updated_at
before update on public.memories
for each row execute function private.set_updated_at();

create table private.couple_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'active',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint couple_invites_status_check check (status in ('active', 'used', 'revoked')),
  constraint couple_invites_used_at_check check (
    (status = 'used' and used_at is not null)
    or (status <> 'used' and used_at is null)
  ),
  constraint couple_invites_expiry_check check (expires_at > created_at)
);

create unique index couple_invites_one_active_creator_idx
on private.couple_invites (created_by)
where status = 'active';

create table private.connection_requests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references private.couple_invites(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  accepted_couple_id uuid references public.couples(id) on delete restrict,
  constraint connection_requests_invite_requester_key unique (invite_id, requester_id),
  constraint connection_requests_actor_client_key unique (requester_id, client_request_id),
  constraint connection_requests_status_check check (
    status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')
  ),
  constraint connection_requests_resolution_check check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  ),
  constraint connection_requests_couple_check check (
    (status = 'accepted' and accepted_couple_id is not null)
    or (status <> 'accepted' and accepted_couple_id is null)
  )
);

create index connection_requests_invite_status_idx
on private.connection_requests (invite_id, status);

create index connection_requests_requester_status_idx
on private.connection_requests (requester_id, status, created_at desc);

create table private.rate_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  bucket_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (actor_id, action, bucket_started_at),
  constraint rate_limits_action_check check (char_length(action) between 1 and 80),
  constraint rate_limits_count_check check (request_count > 0),
  constraint rate_limits_expiry_check check (expires_at > bucket_started_at)
);

create index rate_limits_expiry_idx on private.rate_limits (expires_at);

create table private.idempotency_requests (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  request_id uuid not null,
  payload_hash text not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, action, request_id),
  constraint idempotency_action_check check (char_length(action) between 1 and 80),
  constraint idempotency_payload_hash_check check (char_length(payload_hash) = 64)
);

create function private.is_email_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
  );
$$;

create function private.is_active_couple_member(p_couple_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members cm
    join public.couples c on c.id = cm.couple_id
    where cm.couple_id = p_couple_id
      and cm.user_id = p_user_id
      and cm.left_at is null
      and c.status = 'active'
  );
$$;

create function private.active_couple_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = p_user_id
    and cm.left_at is null
    and c.status = 'active'
  limit 1;
$$;

create function private.consume_rate_limit(
  p_actor_id uuid,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket timestamptz;
  v_count integer;
begin
  if p_max_requests <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid rate limit configuration';
  end if;

  v_bucket := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limits (
    actor_id,
    action,
    bucket_started_at,
    request_count,
    expires_at
  ) values (
    p_actor_id,
    p_action,
    v_bucket,
    1,
    v_bucket + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (actor_id, action, bucket_started_at)
  do update set request_count = private.rate_limits.request_count + 1
  returning request_count into v_count;

  allowed := v_count <= p_max_requests;
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (v_bucket + make_interval(secs => p_window_seconds) - v_now)))::integer
  );
  return next;
end;
$$;

create function private.get_my_context_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_couple jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'UNAUTHENTICATED')
    );
  end if;

  select jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'timezone', p.timezone,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  )
  into v_profile
  from public.profiles p
  where p.id = v_user_id;

  select jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'anniversaryDate', c.anniversary_date,
    'createdAt', c.created_at,
    'partner', jsonb_build_object(
      'id', partner.id,
      'displayName', partner.display_name
    )
  )
  into v_couple
  from public.couple_members mine
  join public.couples c on c.id = mine.couple_id and c.status = 'active'
  join public.couple_members theirs
    on theirs.couple_id = mine.couple_id
   and theirs.user_id <> v_user_id
   and theirs.left_at is null
  join public.profiles partner on partner.id = theirs.user_id
  where mine.user_id = v_user_id
    and mine.left_at is null
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'profile', v_profile,
      'emailVerified', private.is_email_verified(v_user_id),
      'connectionState', case when v_couple is null then 'unpaired' else 'connected' end,
      'couple', v_couple
    )
  );
end;
$$;

create function private.update_my_profile_impl(p_display_name text, p_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := btrim(p_display_name);
  v_profile jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'UNAUTHENTICATED')
    );
  end if;

  if char_length(v_display_name) not between 1 and 50
     or p_timezone is null
     or not exists (
       select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone
     ) then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION_ERROR')
    );
  end if;

  update public.profiles p
  set display_name = v_display_name,
      timezone = p_timezone
  where p.id = v_user_id
  returning jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'timezone', p.timezone,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  ) into v_profile;

  return jsonb_build_object('ok', true, 'data', v_profile);
end;
$$;

create function api.get_my_context()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.get_my_context_impl();
$$;

create function api.update_my_profile(p_display_name text, p_timezone text)
returns jsonb
language sql
set search_path = ''
as $$
  select private.update_my_profile_impl(p_display_name, p_timezone);
$$;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.wishes enable row level security;
alter table public.draws enable row level security;
alter table public.memories enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy couples_select_active_member
on public.couples for select
to authenticated
using (private.is_active_couple_member(id, (select auth.uid())));

create policy couple_members_select_same_active_couple
on public.couple_members for select
to authenticated
using (private.is_active_couple_member(couple_id, (select auth.uid())));

create policy wishes_select_author
on public.wishes for select
to authenticated
using (author_id = (select auth.uid()));

create policy draws_select_active_couple
on public.draws for select
to authenticated
using (private.is_active_couple_member(couple_id, (select auth.uid())));

create policy memories_select_active_couple
on public.memories for select
to authenticated
using (
  exists (
    select 1
    from public.draws d
    where d.id = memories.draw_id
      and private.is_active_couple_member(d.couple_id, (select auth.uid()))
  )
);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.couples, public.couple_members,
  public.wishes, public.draws, public.memories to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema api from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_couple_member(uuid, uuid) to authenticated;
grant execute on function private.active_couple_id(uuid) to authenticated;
grant execute on function private.get_my_context_impl() to authenticated;
grant execute on function private.update_my_profile_impl(text, text) to authenticated;

grant execute on function api.get_my_context() to authenticated;
grant execute on function api.update_my_profile(text, text) to authenticated;

comment on schema private is 'Internal tables and privileged implementation functions; never expose via Data API.';
comment on schema api is 'Narrow Data API RPC surface for authenticated clients.';
comment on column public.profiles.display_name is 'Nullable until onboarding is completed.';
comment on column private.couple_invites.token_hash is 'SHA-256 hash only; plaintext invite codes are never persisted.';

commit;
