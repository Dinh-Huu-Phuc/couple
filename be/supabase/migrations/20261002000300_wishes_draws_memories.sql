begin;

create function private.lock_active_couple(p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
begin
  select c.id
  into v_couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = p_actor
    and cm.left_at is null
    and c.status = 'active'
  for update of c;

  return v_couple_id;
end;
$$;

create function private.create_wish_impl(
  p_title text,
  p_description text,
  p_category text,
  p_budget_vnd bigint,
  p_available_from timestamptz,
  p_expires_at timestamptz,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_title text := btrim(p_title);
  v_description text := coalesce(p_description, '');
  v_payload_hash text;
  v_existing_hash text;
  v_wish_id uuid;
  v_wish jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if not private.is_email_verified(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMAIL_NOT_VERIFIED'));
  end if;

  if p_request_id is null
     or char_length(v_title) not between 1 and 120
     or char_length(v_description) > 2000
     or p_category not in ('food', 'gift', 'date', 'care', 'experience', 'other')
     or (p_budget_vnd is not null and p_budget_vnd not between 0 and 1000000000)
     or (p_available_from is not null and p_expires_at is not null and p_expires_at <= p_available_from)
     or (p_expires_at is not null and p_expires_at <= statement_timestamp()) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_payload_hash := private.sha256_text(jsonb_build_object(
    'title', v_title,
    'description', v_description,
    'category', p_category,
    'budgetVnd', p_budget_vnd,
    'availableFrom', p_available_from,
    'expiresAt', p_expires_at
  )::text);

  select i.payload_hash, i.result_id
  into v_existing_hash, v_wish_id
  from private.idempotency_requests i
  where i.actor_id = v_actor
    and i.action = 'create_wish'
    and i.request_id = p_request_id;

  if found then
    if v_existing_hash <> v_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT'));
    end if;

    select to_jsonb(w) into v_wish
    from public.wishes w
    where w.id = v_wish_id and w.author_id = v_actor;

    return jsonb_build_object('ok', true, 'data', v_wish);
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if (
    select count(*)
    from public.wishes w
    where w.couple_id = v_couple_id
      and w.author_id = v_actor
      and w.status <> 'archived'
  ) >= 200 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'WISH_LIMIT_REACHED'));
  end if;

  insert into public.wishes (
    couple_id, author_id, title, description, category,
    budget_vnd, available_from, expires_at
  ) values (
    v_couple_id, v_actor, v_title, v_description, p_category,
    p_budget_vnd, p_available_from, p_expires_at
  ) returning id, to_jsonb(wishes) into v_wish_id, v_wish;

  insert into private.idempotency_requests (
    actor_id, action, request_id, payload_hash, result_id
  ) values (
    v_actor, 'create_wish', p_request_id, v_payload_hash, v_wish_id
  );

  return jsonb_build_object('ok', true, 'data', v_wish);
end;
$$;

create function private.update_wish_impl(
  p_wish_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_category text,
  p_budget_vnd bigint,
  p_available_from timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_title text := btrim(p_title);
  v_description text := coalesce(p_description, '');
  v_current public.wishes%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if char_length(v_title) not between 1 and 120
     or char_length(v_description) > 2000
     or p_category not in ('food', 'gift', 'date', 'care', 'experience', 'other')
     or (p_budget_vnd is not null and p_budget_vnd not between 0 and 1000000000)
     or (p_available_from is not null and p_expires_at is not null and p_expires_at <= p_available_from)
     or (p_expires_at is not null and p_expires_at <= statement_timestamp()) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_current
  from public.wishes w
  where w.id = p_wish_id
    and w.couple_id = v_couple_id
    and w.author_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if v_current.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'STALE_VERSION'));
  end if;

  if v_current.status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  if exists (
    select 1 from public.draws d
    where d.wish_id = p_wish_id
      and d.status in ('opened', 'accepted', 'discuss')
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'WISH_BUSY'));
  end if;

  update public.wishes w
  set title = v_title,
      description = v_description,
      category = p_category,
      budget_vnd = p_budget_vnd,
      available_from = p_available_from,
      expires_at = p_expires_at,
      version = version + 1
  where w.id = p_wish_id
  returning to_jsonb(w) into v_result;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.set_wish_status_impl(
  p_wish_id uuid,
  p_expected_version integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_current public.wishes%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_status not in ('active', 'paused', 'archived') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_current
  from public.wishes w
  where w.id = p_wish_id
    and w.couple_id = v_couple_id
    and w.author_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if v_current.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'STALE_VERSION'));
  end if;

  if v_current.status = p_status then
    return jsonb_build_object('ok', true, 'data', to_jsonb(v_current));
  end if;

  if not (
    (v_current.status = 'active' and p_status in ('paused', 'archived'))
    or (v_current.status = 'paused' and p_status in ('active', 'archived'))
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  if exists (
    select 1 from public.draws d
    where d.wish_id = p_wish_id
      and d.status in ('opened', 'accepted', 'discuss')
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'WISH_BUSY'));
  end if;

  update public.wishes w
  set status = p_status, version = version + 1
  where w.id = p_wish_id
  returning to_jsonb(w) into v_result;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.withdraw_wish_impl(p_wish_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_current public.wishes%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_current
  from public.wishes w
  where w.id = p_wish_id
    and w.couple_id = v_couple_id
    and w.author_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if v_current.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'STALE_VERSION'));
  end if;

  if v_current.status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  update public.draws d
  set status = 'cancelled', resolved_at = statement_timestamp()
  where d.wish_id = p_wish_id
    and d.status in ('opened', 'accepted', 'discuss');

  update public.wishes w
  set status = 'archived', version = version + 1
  where w.id = p_wish_id
  returning to_jsonb(w) into v_result;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.draw_wish_impl(
  p_request_id uuid,
  p_category text,
  p_max_budget_vnd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_payload_hash text;
  v_existing_hash text;
  v_draw_id uuid;
  v_draw jsonb;
  v_wish public.wishes%rowtype;
  v_allowed boolean;
  v_retry integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_request_id is null
     or (p_category is not null and p_category not in ('food', 'gift', 'date', 'care', 'experience', 'other'))
     or (p_max_budget_vnd is not null and p_max_budget_vnd not between 0 and 1000000000) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_payload_hash := private.sha256_text(jsonb_build_object(
    'category', p_category,
    'maxBudgetVnd', p_max_budget_vnd
  )::text);

  select i.payload_hash, i.result_id
  into v_existing_hash, v_draw_id
  from private.idempotency_requests i
  where i.actor_id = v_actor
    and i.action = 'draw_wish'
    and i.request_id = p_request_id;

  if found then
    if v_existing_hash <> v_payload_hash then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT'));
    end if;
    select to_jsonb(d) into v_draw from public.draws d where d.id = v_draw_id;
    return jsonb_build_object('ok', true, 'data', v_draw || jsonb_build_object('resumed', true));
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from private.consume_rate_limit(v_actor, 'draw_wish', 30, 60);

  if not v_allowed then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'RATE_LIMITED', 'retryAfterSeconds', v_retry)
    );
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select d.id, to_jsonb(d)
  into v_draw_id, v_draw
  from public.draws d
  where d.couple_id = v_couple_id
    and d.drawn_by = v_actor
    and d.status in ('opened', 'accepted', 'discuss')
  limit 1;

  if found then
    insert into private.idempotency_requests (
      actor_id, action, request_id, payload_hash, result_id
    ) values (
      v_actor, 'draw_wish', p_request_id, v_payload_hash, v_draw_id
    );
    return jsonb_build_object('ok', true, 'data', v_draw || jsonb_build_object('resumed', true));
  end if;

  select w.* into v_wish
  from public.wishes w
  where w.couple_id = v_couple_id
    and w.author_id <> v_actor
    and w.status = 'active'
    and (w.available_from is null or w.available_from <= statement_timestamp())
    and (w.expires_at is null or w.expires_at > statement_timestamp())
    and (w.eligible_after is null or w.eligible_after <= statement_timestamp())
    and (p_category is null or w.category = p_category)
    and (p_max_budget_vnd is null or (w.budget_vnd is not null and w.budget_vnd <= p_max_budget_vnd))
    and not exists (
      select 1 from public.draws open_draw
      where open_draw.wish_id = w.id
        and open_draw.status in ('opened', 'accepted', 'discuss')
    )
  order by exists (
    select 1 from public.draws prior_draw where prior_draw.wish_id = w.id
  ) asc, random()
  limit 1
  for update of w skip locked;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'EMPTY_POOL'));
  end if;

  insert into public.draws (
    couple_id, wish_id, drawn_by, request_id, snapshot
  ) values (
    v_couple_id,
    v_wish.id,
    v_actor,
    p_request_id,
    jsonb_build_object(
      'schemaVersion', 1,
      'title', v_wish.title,
      'description', v_wish.description,
      'category', v_wish.category,
      'budgetVnd', v_wish.budget_vnd,
      'availableFrom', v_wish.available_from,
      'expiresAt', v_wish.expires_at,
      'wishVersion', v_wish.version
    )
  ) returning id, to_jsonb(draws) into v_draw_id, v_draw;

  insert into private.idempotency_requests (
    actor_id, action, request_id, payload_hash, result_id
  ) values (
    v_actor, 'draw_wish', p_request_id, v_payload_hash, v_draw_id
  );

  return jsonb_build_object('ok', true, 'data', v_draw || jsonb_build_object('resumed', false));
end;
$$;

create function private.respond_draw_impl(p_draw_id uuid, p_response text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_draw public.draws%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_response not in ('accepted', 'discuss', 'deferred') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_draw
  from public.draws d
  where d.id = p_draw_id
    and d.couple_id = v_couple_id
    and d.drawn_by = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  perform 1 from public.wishes w where w.id = v_draw.wish_id for update;

  if v_draw.status = p_response then
    return jsonb_build_object('ok', true, 'data', to_jsonb(v_draw));
  end if;

  if not (
    (p_response = 'accepted' and v_draw.status in ('opened', 'discuss'))
    or (p_response = 'discuss' and v_draw.status = 'opened')
    or (p_response = 'deferred' and v_draw.status in ('opened', 'discuss', 'accepted'))
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  if p_response = 'deferred' then
    update public.draws d
    set status = 'deferred', resolved_at = statement_timestamp()
    where d.id = p_draw_id
    returning to_jsonb(d) into v_result;

    update public.wishes w
    set eligible_after = statement_timestamp() + interval '72 hours'
    where w.id = v_draw.wish_id;
  elsif p_response = 'accepted' then
    update public.draws d
    set status = 'accepted', accepted_at = coalesce(accepted_at, statement_timestamp())
    where d.id = p_draw_id
    returning to_jsonb(d) into v_result;
  else
    update public.draws d
    set status = 'discuss'
    where d.id = p_draw_id
    returning to_jsonb(d) into v_result;
  end if;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.complete_draw_impl(p_draw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_draw public.draws%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_draw
  from public.draws d
  where d.id = p_draw_id
    and d.couple_id = v_couple_id
    and d.drawn_by = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  perform 1 from public.wishes w where w.id = v_draw.wish_id for update;

  if v_draw.status = 'completed' then
    return jsonb_build_object('ok', true, 'data', to_jsonb(v_draw));
  end if;

  if v_draw.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  update public.draws d
  set status = 'completed',
      completed_at = statement_timestamp(),
      resolved_at = statement_timestamp()
  where d.id = p_draw_id
  returning to_jsonb(d) into v_result;

  update public.wishes w
  set status = 'fulfilled', version = version + 1
  where w.id = v_draw.wish_id;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.save_memory_impl(
  p_draw_id uuid,
  p_message text,
  p_photo_storage_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_draw public.draws%rowtype;
  v_message text := coalesce(p_message, '');
  v_expected_prefix text;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if char_length(v_message) > 1000
     or (char_length(btrim(v_message)) = 0 and p_photo_storage_key is null) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select * into v_draw
  from public.draws d
  where d.id = p_draw_id
    and d.couple_id = v_couple_id
    and d.drawn_by = v_actor
  for update;

  if not found or v_draw.status <> 'completed' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if p_photo_storage_key is not null then
    v_expected_prefix := v_couple_id::text || '/' || p_draw_id::text || '/' || v_actor::text || '/';
    if left(p_photo_storage_key, char_length(v_expected_prefix)) <> v_expected_prefix
       or p_photo_storage_key !~ '\.(jpe?g|png|webp)$' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'couple-memories'
        and o.name = p_photo_storage_key
    ) then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'PHOTO_NOT_FOUND'));
    end if;
  end if;

  insert into public.memories (draw_id, created_by, message, photo_storage_key)
  values (p_draw_id, v_actor, v_message, p_photo_storage_key)
  on conflict (draw_id) do update
    set message = excluded.message,
        photo_storage_key = excluded.photo_storage_key
    where public.memories.created_by = v_actor
  returning to_jsonb(memories) into v_result;

  if v_result is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

create function private.end_couple_impl(p_couple_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_payload_hash text;
  v_existing_hash text;
  v_existing_result uuid;
  v_member_ids uuid[];
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;

  if p_couple_id is null or p_request_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_payload_hash := private.sha256_text(jsonb_build_object('coupleId', p_couple_id)::text);

  select i.payload_hash, i.result_id
  into v_existing_hash, v_existing_result
  from private.idempotency_requests i
  where i.actor_id = v_actor
    and i.action = 'end_couple'
    and i.request_id = p_request_id;

  if found then
    if v_existing_hash <> v_payload_hash or v_existing_result <> p_couple_id then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'IDEMPOTENCY_CONFLICT'));
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('coupleId', p_couple_id, 'status', 'ended'));
  end if;

  perform 1 from public.couples c where c.id = p_couple_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  if not exists (
    select 1 from public.couple_members cm
    where cm.couple_id = p_couple_id
      and cm.user_id = v_actor
      and cm.left_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;

  select array_agg(cm.user_id) into v_member_ids
  from public.couple_members cm
  where cm.couple_id = p_couple_id and cm.left_at is null;

  update public.draws d
  set status = 'cancelled', resolved_at = statement_timestamp()
  where d.couple_id = p_couple_id
    and d.status in ('opened', 'accepted', 'discuss');

  update public.couple_members cm
  set left_at = statement_timestamp()
  where cm.couple_id = p_couple_id and cm.left_at is null;

  update public.couples c
  set status = 'ended', ended_at = statement_timestamp()
  where c.id = p_couple_id;

  update private.couple_invites ci
  set status = 'revoked'
  where ci.created_by = any(v_member_ids) and ci.status = 'active';

  update private.connection_requests cr
  set status = 'cancelled', resolved_at = statement_timestamp()
  where cr.status = 'pending'
    and (
      cr.requester_id = any(v_member_ids)
      or cr.invite_id in (
        select ci.id from private.couple_invites ci where ci.created_by = any(v_member_ids)
      )
    );

  insert into private.idempotency_requests (
    actor_id, action, request_id, payload_hash, result_id
  ) values (
    v_actor, 'end_couple', p_request_id, v_payload_hash, p_couple_id
  );

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('coupleId', p_couple_id, 'status', 'ended'));
end;
$$;

create function api.create_wish(
  p_title text,
  p_description text default '',
  p_category text default 'other',
  p_budget_vnd bigint default null,
  p_available_from timestamptz default null,
  p_expires_at timestamptz default null,
  p_request_id uuid default null
)
returns jsonb language sql set search_path = ''
as $$ select private.create_wish_impl(p_title, p_description, p_category, p_budget_vnd, p_available_from, p_expires_at, p_request_id); $$;

create function api.update_wish(
  p_wish_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_category text,
  p_budget_vnd bigint,
  p_available_from timestamptz,
  p_expires_at timestamptz
)
returns jsonb language sql set search_path = ''
as $$ select private.update_wish_impl(p_wish_id, p_expected_version, p_title, p_description, p_category, p_budget_vnd, p_available_from, p_expires_at); $$;

create function api.set_wish_status(p_wish_id uuid, p_expected_version integer, p_status text)
returns jsonb language sql set search_path = ''
as $$ select private.set_wish_status_impl(p_wish_id, p_expected_version, p_status); $$;

create function api.withdraw_wish(p_wish_id uuid, p_expected_version integer)
returns jsonb language sql set search_path = ''
as $$ select private.withdraw_wish_impl(p_wish_id, p_expected_version); $$;

create function api.draw_wish(
  p_request_id uuid,
  p_category text default null,
  p_max_budget_vnd bigint default null
)
returns jsonb language sql set search_path = ''
as $$ select private.draw_wish_impl(p_request_id, p_category, p_max_budget_vnd); $$;

create function api.respond_draw(p_draw_id uuid, p_response text)
returns jsonb language sql set search_path = ''
as $$ select private.respond_draw_impl(p_draw_id, p_response); $$;

create function api.complete_draw(p_draw_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.complete_draw_impl(p_draw_id); $$;

create function api.save_memory(p_draw_id uuid, p_message text default '', p_photo_storage_key text default null)
returns jsonb language sql set search_path = ''
as $$ select private.save_memory_impl(p_draw_id, p_message, p_photo_storage_key); $$;

create function api.end_couple(p_couple_id uuid, p_request_id uuid)
returns jsonb language sql set search_path = ''
as $$ select private.end_couple_impl(p_couple_id, p_request_id); $$;

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
grant execute on function private.create_wish_impl(text, text, text, bigint, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function private.update_wish_impl(uuid, integer, text, text, text, bigint, timestamptz, timestamptz) to authenticated;
grant execute on function private.set_wish_status_impl(uuid, integer, text) to authenticated;
grant execute on function private.withdraw_wish_impl(uuid, integer) to authenticated;
grant execute on function private.draw_wish_impl(uuid, text, bigint) to authenticated;
grant execute on function private.respond_draw_impl(uuid, text) to authenticated;
grant execute on function private.complete_draw_impl(uuid) to authenticated;
grant execute on function private.save_memory_impl(uuid, text, text) to authenticated;
grant execute on function private.end_couple_impl(uuid, uuid) to authenticated;

grant execute on all functions in schema api to authenticated;

commit;
