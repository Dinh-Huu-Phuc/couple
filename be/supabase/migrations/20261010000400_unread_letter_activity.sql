begin;
-- Return only unread activity without the REST row limit hiding newer letters.
create function api.list_letter_activity()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if not private.account_available(v_actor) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.updated_at desc),'[]'::jsonb)
  into v_result from public.letter_activity a
  where a.recipient_id=v_actor and a.version>a.seen_version
    and private.is_active_couple_member(a.couple_id,v_actor);
  return jsonb_build_object('ok',true,'data',v_result);
end;
$$;
revoke all on function api.list_letter_activity() from public,anon;
grant execute on function api.list_letter_activity() to authenticated;
commit;
