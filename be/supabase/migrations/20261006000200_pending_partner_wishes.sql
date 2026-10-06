begin;

-- Only the recipient learns the number of never-drawn, currently drawable wishes.
-- Wish content remains protected by the existing author-only RLS policy.
create function api.pending_partner_wish_count()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_count integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  v_couple_id := private.active_couple_id(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', true, 'data', 0);
  end if;

  select count(*)::integer into v_count
  from public.wishes w
  where w.couple_id = v_couple_id
    and w.author_id <> v_actor
    and w.status = 'active'
    and (w.available_from is null or w.available_from <= statement_timestamp())
    and (w.expires_at is null or w.expires_at > statement_timestamp())
    and (w.eligible_after is null or w.eligible_after <= statement_timestamp())
    and not exists (
      select 1 from public.draws d
      where d.wish_id = w.id and d.drawn_by = v_actor
    )
    and not exists (
      select 1 from public.draws d
      where d.wish_id = w.id and d.status in ('opened', 'accepted', 'discuss')
    );
  return jsonb_build_object('ok', true, 'data', v_count);
end;
$$;

revoke all on function api.pending_partner_wish_count() from public, anon, authenticated;
grant execute on function api.pending_partner_wish_count() to authenticated;

create or replace function private.draw_wish_impl(
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
    -- Prefer unseen wishes across the whole pool so a successful new draw
    -- always consumes one badge item. Clear narrow filters if none match.
    and (
      not exists (
        select 1 from public.wishes unseen
        where unseen.couple_id = v_couple_id
          and unseen.author_id <> v_actor
          and unseen.status = 'active'
          and (unseen.available_from is null or unseen.available_from <= statement_timestamp())
          and (unseen.expires_at is null or unseen.expires_at > statement_timestamp())
          and (unseen.eligible_after is null or unseen.eligible_after <= statement_timestamp())
          and not exists (select 1 from public.draws prior where prior.wish_id = unseen.id and prior.drawn_by = v_actor)
          and not exists (select 1 from public.draws active_draw where active_draw.wish_id = unseen.id and active_draw.status in ('opened', 'accepted', 'discuss'))
      )
      or not exists (select 1 from public.draws prior where prior.wish_id = w.id and prior.drawn_by = v_actor)
    )
    and (p_category is null or w.category = p_category)
    and (p_max_budget_vnd is null or (w.budget_vnd is not null and w.budget_vnd <= p_max_budget_vnd))
    and not exists (
      select 1 from public.draws open_draw
      where open_draw.wish_id = w.id
        and open_draw.status in ('opened', 'accepted', 'discuss')
    )
  order by exists (
    select 1 from public.draws prior_draw where prior_draw.wish_id = w.id and prior_draw.drawn_by = v_actor
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

commit;
