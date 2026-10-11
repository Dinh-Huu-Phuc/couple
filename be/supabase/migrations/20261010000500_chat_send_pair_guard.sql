begin;
-- A queued send must not follow the sender into a different pairing.
create function api.send_chat_message_to_couple(p_couple_id uuid,p_body text,p_request_id uuid,p_photo_storage_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_couple uuid;
begin
  v_couple:=private.lock_active_couple(auth.uid());
  if v_couple is null or p_couple_id is distinct from v_couple then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  return api.send_chat_message(p_body,p_request_id,p_photo_storage_key);
end;
$$;
revoke all on function api.send_chat_message_to_couple(uuid,text,uuid,text) from public,anon;
grant execute on function api.send_chat_message_to_couple(uuid,text,uuid,text) to authenticated;
commit;
