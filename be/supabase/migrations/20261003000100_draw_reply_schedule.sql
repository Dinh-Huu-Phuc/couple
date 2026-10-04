begin;

alter table public.draws
  add column discussion_message text not null default '',
  add column discussion_at timestamptz,
  add column deferred_until timestamptz;

-- Preserve the original 72-hour rule for historical deferrals. New deferrals
-- must use an explicit future timestamp from the caller.
update public.draws
set deferred_until = resolved_at + interval '72 hours'
where status = 'deferred';

alter table public.draws
  add constraint draws_discussion_message_check check (
    char_length(discussion_message) <= 1000
    and ((discussion_message = '' and discussion_at is null)
      or (char_length(btrim(discussion_message)) > 0 and discussion_at is not null))
  ),
  add constraint draws_deferred_until_check check (
    (status = 'deferred' and deferred_until is not null)
    or (status <> 'deferred' and deferred_until is null)
  );

create function private.respond_draw_impl(
  p_draw_id uuid,
  p_response text,
  p_message text,
  p_deferred_until timestamptz
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
  v_message text := btrim(coalesce(p_message, ''));
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED'));
  end if;
  if p_response is null or p_response not in ('accepted', 'discuss', 'deferred')
     or (p_response <> 'discuss' and p_message is not null)
     or (p_response <> 'deferred' and p_deferred_until is not null) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'VALIDATION_ERROR'));
  end if;

  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  select * into v_draw from public.draws d
  where d.id = p_draw_id and d.couple_id = v_couple_id and d.drawn_by = v_actor
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'NOT_ALLOWED'));
  end if;
  perform 1 from public.wishes w where w.id = v_draw.wish_id for update;

  if p_response = 'discuss' and (char_length(v_message) = 0 or char_length(v_message) > 1000) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'DISCUSSION_MESSAGE_REQUIRED'));
  end if;
  if p_response = 'deferred' and p_deferred_until is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'DEFER_TIME_REQUIRED'));
  end if;

  -- Exact retries return the persisted reply/schedule, including after the
  -- selected timestamp has passed. A closed deferral cannot be rescheduled.
  if v_draw.status = p_response and (
    p_response = 'accepted'
    or (p_response = 'discuss' and v_draw.discussion_message = v_message)
    or (p_response = 'deferred' and v_draw.deferred_until = p_deferred_until)
  ) then
    return jsonb_build_object('ok', true, 'data', to_jsonb(v_draw));
  end if;
  if not (
    (p_response = 'accepted' and v_draw.status in ('opened', 'discuss'))
    or (p_response = 'discuss' and v_draw.status in ('opened', 'discuss'))
    or (p_response = 'deferred' and v_draw.status in ('opened', 'discuss', 'accepted'))
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'INVALID_TRANSITION'));
  end if;

  if p_response = 'deferred' then
    if not isfinite(p_deferred_until) or p_deferred_until <= statement_timestamp() then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'DEFER_TIME_INVALID'));
    end if;
    update public.draws d
    set status = 'deferred', resolved_at = statement_timestamp(), deferred_until = p_deferred_until
    where d.id = p_draw_id returning to_jsonb(d) into v_result;
    update public.wishes w set eligible_after = p_deferred_until where w.id = v_draw.wish_id;
  elsif p_response = 'accepted' then
    update public.draws d
    set status = 'accepted', accepted_at = coalesce(accepted_at, statement_timestamp())
    where d.id = p_draw_id returning to_jsonb(d) into v_result;
  else
    update public.draws d
    set status = 'discuss', discussion_message = v_message, discussion_at = statement_timestamp()
    where d.id = p_draw_id returning to_jsonb(d) into v_result;
  end if;
  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

-- Keep the old two-argument contract for accept, while preventing old clients
-- from bypassing the required message or chosen schedule.
create or replace function private.respond_draw_impl(p_draw_id uuid, p_response text)
returns jsonb language sql security definer set search_path = ''
as $$ select private.respond_draw_impl(p_draw_id, p_response, null, null); $$;

create function api.respond_draw(
  p_draw_id uuid,
  p_response text,
  p_message text,
  p_deferred_until timestamptz
)
returns jsonb language sql set search_path = ''
as $$ select private.respond_draw_impl(p_draw_id, p_response, p_message, p_deferred_until); $$;

revoke all on function private.respond_draw_impl(uuid, text, text, timestamptz) from public, anon;
revoke all on function api.respond_draw(uuid, text, text, timestamptz) from public, anon;
grant execute on function private.respond_draw_impl(uuid, text, text, timestamptz) to authenticated;
grant execute on function api.respond_draw(uuid, text, text, timestamptz) to authenticated;

commit;
