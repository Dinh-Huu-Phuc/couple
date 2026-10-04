begin;

create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
  v_index integer := 0;
begin
  while v_index < 10 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % 32) + 1, 1);
    v_index := v_index + 1;
  end loop;
  return v_code;
end;
$$;

create function private.sha256_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$$;

create function private.create_invite_impl(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_allowed boolean;
  v_retry integer;
  v_code text;
  v_invite_id uuid;
  v_expires_at timestamptz;
  v_attempt integer := 1;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  if not private.is_email_verified(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMAIL_NOT_VERIFIED'));
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_actor and p.display_name is not null
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'PROFILE_INCOMPLETE'));
  end if;

  if exists (
    select 1
    from private.idempotency_requests i
    where i.actor_id = v_actor
      and i.action = 'create_invite'
      and i.request_id = p_request_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'INVITE_CODE_NOT_REPLAYABLE')
    );
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from private.consume_rate_limit(v_actor, 'create_invite', 5, 3600);

  if not v_allowed then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'RATE_LIMITED', 'retryAfterSeconds', v_retry)
    );
  end if;

  perform 1 from public.profiles p where p.id = v_actor for update;

  if private.active_couple_id(v_actor) is not null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'ALREADY_CONNECTED'));
  end if;

  with revoked as (
    update private.couple_invites ci
    set status = 'revoked'
    where ci.created_by = v_actor
      and ci.status = 'active'
    returning ci.id
  )
  update private.connection_requests cr
  set status = 'cancelled', resolved_at = statement_timestamp()
  where cr.invite_id in (select id from revoked)
    and cr.status = 'pending';

  while v_attempt <= 5 loop
    v_code := private.generate_invite_code();
    v_expires_at := statement_timestamp() + interval '24 hours';
    begin
      insert into private.couple_invites (created_by, token_hash, expires_at)
      values (v_actor, private.sha256_text(v_code), v_expires_at)
      returning id into v_invite_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise;
      end if;
    end;
    v_attempt := v_attempt + 1;
  end loop;

  insert into private.idempotency_requests (
    actor_id, action, request_id, payload_hash, result_id
  ) values (
    v_actor,
    'create_invite',
    p_request_id,
    private.sha256_text('{}'),
    v_invite_id
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'inviteId', v_invite_id,
      'code', v_code,
      'expiresAt', v_expires_at
    )
  );
end;
$$;

create function private.revoke_invite_impl(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  update private.couple_invites ci
  set status = 'revoked'
  where ci.id = p_invite_id
    and ci.created_by = v_actor
    and ci.status = 'active';

  if not found and not exists (
    select 1 from private.couple_invites ci
    where ci.id = p_invite_id and ci.created_by = v_actor
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  update private.connection_requests cr
  set status = 'cancelled', resolved_at = statement_timestamp()
  where cr.invite_id = p_invite_id
    and cr.status = 'pending';

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('inviteId', p_invite_id));
end;
$$;

create function private.preview_invite_impl(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_allowed boolean;
  v_retry integer;
  v_invite record;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if not private.is_email_verified(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMAIL_NOT_VERIFIED'));
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from private.consume_rate_limit(v_actor, 'connect_code', 10, 600);

  if not v_allowed then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'RATE_LIMITED', 'retryAfterSeconds', v_retry)
    );
  end if;

  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVITE_INVALID_OR_EXPIRED'));
  end if;

  select ci.id, ci.created_by, ci.expires_at, p.display_name
  into v_invite
  from private.couple_invites ci
  join public.profiles p on p.id = ci.created_by
  where ci.token_hash = private.sha256_text(v_code)
    and ci.status = 'active'
    and ci.expires_at > statement_timestamp();

  if not found or private.active_couple_id(v_invite.created_by) is not null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVITE_INVALID_OR_EXPIRED'));
  end if;

  if v_invite.created_by = v_actor then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'SELF_CONNECT'));
  end if;

  if private.active_couple_id(v_actor) is not null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'ALREADY_CONNECTED'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'inviteId', v_invite.id,
      'inviter', jsonb_build_object(
        'id', v_invite.created_by,
        'displayName', v_invite.display_name
      ),
      'expiresAt', v_invite.expires_at
    )
  );
end;
$$;

create function private.request_connection_impl(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_payload_hash text;
  v_allowed boolean;
  v_retry integer;
  v_inviter uuid;
  v_invite_id uuid;
  v_request_id uuid;
  v_status text;
  v_existing_hash text;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_request_id is null or v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  if not private.is_email_verified(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMAIL_NOT_VERIFIED'));
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_actor and p.display_name is not null
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'PROFILE_INCOMPLETE'));
  end if;

  v_payload_hash := private.sha256_text(jsonb_build_object('code', v_code)::text);

  select i.payload_hash, i.result_id
  into v_existing_hash, v_request_id
  from private.idempotency_requests i
  where i.actor_id = v_actor
    and i.action = 'request_connection'
    and i.request_id = p_request_id;

  if found then
    if v_existing_hash <> v_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT'));
    end if;

    select cr.status into v_status
    from private.connection_requests cr
    where cr.id = v_request_id;

    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('connectionRequestId', v_request_id, 'status', v_status)
    );
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from private.consume_rate_limit(v_actor, 'connect_code', 10, 600);

  if not v_allowed then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'RATE_LIMITED', 'retryAfterSeconds', v_retry)
    );
  end if;

  select ci.id, ci.created_by
  into v_invite_id, v_inviter
  from private.couple_invites ci
  where ci.token_hash = private.sha256_text(v_code)
    and ci.status = 'active'
    and ci.expires_at > statement_timestamp();

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVITE_INVALID_OR_EXPIRED'));
  end if;

  if v_inviter = v_actor then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'SELF_CONNECT'));
  end if;

  perform 1
  from public.profiles p
  where p.id in (v_actor, v_inviter)
  order by p.id
  for update;

  select ci.id, ci.created_by
  into v_invite_id, v_inviter
  from private.couple_invites ci
  where ci.id = v_invite_id
    and ci.status = 'active'
    and ci.expires_at > statement_timestamp()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVITE_INVALID_OR_EXPIRED'));
  end if;

  if private.active_couple_id(v_actor) is not null
     or private.active_couple_id(v_inviter) is not null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'ALREADY_CONNECTED'));
  end if;

  select cr.id, cr.status
  into v_request_id, v_status
  from private.connection_requests cr
  where cr.invite_id = v_invite_id
    and cr.requester_id = v_actor;

  if found then
    if v_status = 'pending' then
      return jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object('connectionRequestId', v_request_id, 'status', v_status)
      );
    end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'DUPLICATE_REQUEST'));
  end if;

  insert into private.connection_requests (
    invite_id, requester_id, client_request_id
  ) values (
    v_invite_id, v_actor, p_request_id
  ) returning id, status into v_request_id, v_status;

  insert into private.idempotency_requests (
    actor_id, action, request_id, payload_hash, result_id
  ) values (
    v_actor, 'request_connection', p_request_id, v_payload_hash, v_request_id
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('connectionRequestId', v_request_id, 'status', v_status)
  );
end;
$$;

create function private.list_connection_requests_impl(p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_incoming
  from (
    select jsonb_build_object(
      'id', cr.id,
      'status', cr.status,
      'createdAt', cr.created_at,
      'requester', jsonb_build_object('id', p.id, 'displayName', p.display_name)
    ) as row_data, cr.created_at
    from private.connection_requests cr
    join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = cr.requester_id
    where ci.created_by = v_actor
      and (p_before is null or cr.created_at < p_before)
    order by cr.created_at desc, cr.id desc
    limit v_limit
  ) incoming_rows;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_outgoing
  from (
    select jsonb_build_object(
      'id', cr.id,
      'status', cr.status,
      'createdAt', cr.created_at,
      'inviter', jsonb_build_object('id', p.id, 'displayName', p.display_name)
    ) as row_data, cr.created_at
    from private.connection_requests cr
    join private.couple_invites ci on ci.id = cr.invite_id
    join public.profiles p on p.id = ci.created_by
    where cr.requester_id = v_actor
      and (p_before is null or cr.created_at < p_before)
    order by cr.created_at desc, cr.id desc
    limit v_limit
  ) outgoing_rows;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('incoming', v_incoming, 'outgoing', v_outgoing)
  );
end;
$$;

create function private.respond_connection_impl(p_connection_request_id uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
  v_inviter uuid;
  v_invite_id uuid;
  v_status text;
  v_expires_at timestamptz;
  v_couple_id uuid;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_response not in ('accept', 'reject') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  select cr.requester_id, ci.created_by
  into v_requester, v_inviter
  from private.connection_requests cr
  join private.couple_invites ci on ci.id = cr.invite_id
  where cr.id = p_connection_request_id;

  if not found or v_inviter <> v_actor then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  perform 1
  from public.profiles p
  where p.id in (v_requester, v_inviter)
  order by p.id
  for update;

  select cr.status, cr.accepted_couple_id, cr.invite_id, ci.expires_at
  into v_status, v_couple_id, v_invite_id, v_expires_at
  from private.connection_requests cr
  join private.couple_invites ci on ci.id = cr.invite_id
  where cr.id = p_connection_request_id
    and ci.created_by = v_actor
  for update of cr, ci;

  if v_status <> 'pending' then
    if (v_status = 'accepted' and p_response = 'accept')
       or (v_status = 'rejected' and p_response = 'reject') then
      return jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
          'connectionRequestId', p_connection_request_id,
          'status', v_status,
          'coupleId', v_couple_id
        )
      );
    end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'REQUEST_NOT_PENDING'));
  end if;

  if p_response = 'reject' then
    update private.connection_requests
    set status = 'rejected', resolved_at = statement_timestamp()
    where id = p_connection_request_id;

    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object('connectionRequestId', p_connection_request_id, 'status', 'rejected')
    );
  end if;

  if v_expires_at <= statement_timestamp() then
    update private.connection_requests
    set status = 'expired', resolved_at = statement_timestamp()
    where id = p_connection_request_id;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVITE_INVALID_OR_EXPIRED'));
  end if;

  if not private.is_email_verified(v_requester)
     or not private.is_email_verified(v_inviter) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMAIL_NOT_VERIFIED'));
  end if;

  if private.active_couple_id(v_requester) is not null
     or private.active_couple_id(v_inviter) is not null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'ALREADY_CONNECTED'));
  end if;

  insert into public.couples (status)
  values ('active')
  returning id into v_couple_id;

  insert into public.couple_members (couple_id, user_id)
  values (v_couple_id, v_inviter), (v_couple_id, v_requester);

  update private.connection_requests
  set status = 'accepted',
      resolved_at = statement_timestamp(),
      accepted_couple_id = v_couple_id
  where id = p_connection_request_id;

  update private.couple_invites
  set status = 'used', used_at = statement_timestamp()
  where id = v_invite_id;

  update private.couple_invites
  set status = 'revoked'
  where created_by in (v_requester, v_inviter)
    and status = 'active';

  update private.connection_requests cr
  set status = 'cancelled', resolved_at = statement_timestamp()
  where cr.id <> p_connection_request_id
    and cr.status = 'pending'
    and (
      cr.requester_id in (v_requester, v_inviter)
      or cr.invite_id in (
        select ci.id
        from private.couple_invites ci
        where ci.created_by in (v_requester, v_inviter)
      )
    );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'connectionRequestId', p_connection_request_id,
      'status', 'accepted',
      'coupleId', v_couple_id
    )
  );
end;
$$;

create function private.cancel_connection_request_impl(p_connection_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  update private.connection_requests cr
  set status = 'cancelled', resolved_at = statement_timestamp()
  where cr.id = p_connection_request_id
    and cr.requester_id = v_actor
    and cr.status = 'pending';

  if not found then
    if exists (
      select 1 from private.connection_requests cr
      where cr.id = p_connection_request_id and cr.requester_id = v_actor
    ) then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'REQUEST_NOT_PENDING'));
    end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('connectionRequestId', p_connection_request_id, 'status', 'cancelled')
  );
end;
$$;

create or replace function private.get_my_context_impl()
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
  v_invite jsonb;
  v_incoming_count integer;
  v_outgoing_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  select jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'timezone', p.timezone,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  ) into v_profile
  from public.profiles p
  where p.id = v_user_id;

  select jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'anniversaryDate', c.anniversary_date,
    'createdAt', c.created_at,
    'partner', jsonb_build_object('id', partner.id, 'displayName', partner.display_name)
  ) into v_couple
  from public.couple_members mine
  join public.couples c on c.id = mine.couple_id and c.status = 'active'
  join public.couple_members theirs
    on theirs.couple_id = mine.couple_id
   and theirs.user_id <> v_user_id
   and theirs.left_at is null
  join public.profiles partner on partner.id = theirs.user_id
  where mine.user_id = v_user_id and mine.left_at is null
  limit 1;

  if v_couple is null then
    select jsonb_build_object('id', ci.id, 'expiresAt', ci.expires_at)
    into v_invite
    from private.couple_invites ci
    where ci.created_by = v_user_id
      and ci.status = 'active'
      and ci.expires_at > statement_timestamp()
    limit 1;

    select count(*)::integer into v_incoming_count
    from private.connection_requests cr
    join private.couple_invites ci on ci.id = cr.invite_id
    where ci.created_by = v_user_id and cr.status = 'pending';

    select count(*)::integer into v_outgoing_count
    from private.connection_requests cr
    where cr.requester_id = v_user_id and cr.status = 'pending';
  else
    v_incoming_count := 0;
    v_outgoing_count := 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'profile', v_profile,
      'emailVerified', private.is_email_verified(v_user_id),
      'connectionState', case
        when v_couple is not null then 'connected'
        when v_incoming_count > 0 then 'incoming_request'
        when v_outgoing_count > 0 then 'outgoing_request'
        else 'unpaired'
      end,
      'couple', v_couple,
      'activeInvite', v_invite,
      'pendingIncomingCount', v_incoming_count,
      'pendingOutgoingCount', v_outgoing_count
    )
  );
end;
$$;

create function api.create_invite(p_request_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.create_invite_impl(p_request_id); $$;

create function api.revoke_invite(p_invite_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.revoke_invite_impl(p_invite_id); $$;

create function api.preview_invite(p_code text)
returns jsonb language sql set search_path = ''
as $$ select private.preview_invite_impl(p_code); $$;

create function api.request_connection(p_code text, p_request_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.request_connection_impl(p_code, p_request_id); $$;

create function api.list_connection_requests(p_limit integer default 20, p_before timestamptz default null)
returns jsonb language sql stable set search_path = ''
as $$ select private.list_connection_requests_impl(p_limit, p_before); $$;

create function api.respond_connection(p_connection_request_id uuid, p_response text)
returns jsonb language sql set search_path = ''
as $$ select private.respond_connection_impl(p_connection_request_id, p_response); $$;

create function api.cancel_connection_request(p_connection_request_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.cancel_connection_request_impl(p_connection_request_id); $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema api from public, anon, authenticated;

grant execute on function private.is_active_couple_member(uuid, uuid) to authenticated;
grant execute on function private.active_couple_id(uuid) to authenticated;
grant execute on function private.get_my_context_impl() to authenticated;
grant execute on function private.update_my_profile_impl(text, text) to authenticated;
grant execute on function private.create_invite_impl(uuid) to authenticated;
grant execute on function private.revoke_invite_impl(uuid) to authenticated;
grant execute on function private.preview_invite_impl(text) to authenticated;
grant execute on function private.request_connection_impl(text, uuid) to authenticated;
grant execute on function private.list_connection_requests_impl(integer, timestamptz) to authenticated;
grant execute on function private.respond_connection_impl(uuid, text) to authenticated;
grant execute on function private.cancel_connection_request_impl(uuid) to authenticated;

grant execute on function api.get_my_context() to authenticated;
grant execute on function api.update_my_profile(text, text) to authenticated;
grant execute on function api.create_invite(uuid) to authenticated;
grant execute on function api.revoke_invite(uuid) to authenticated;
grant execute on function api.preview_invite(text) to authenticated;
grant execute on function api.request_connection(text, uuid) to authenticated;
grant execute on function api.list_connection_requests(integer, timestamptz) to authenticated;
grant execute on function api.respond_connection(uuid, text) to authenticated;
grant execute on function api.cancel_connection_request(uuid) to authenticated;

commit;
