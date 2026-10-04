begin;

create or replace function private.generate_invite_code()
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

create or replace function private.create_invite_impl(p_request_id uuid)
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

revoke execute on function private.generate_invite_code() from public, anon, authenticated;
revoke execute on function private.create_invite_impl(uuid) from public, anon;
grant execute on function private.create_invite_impl(uuid) to authenticated;

commit;
