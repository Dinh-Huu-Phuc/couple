begin;

alter table public.chat_messages add column delivered_at timestamptz,
  add column read_at timestamptz,
  add constraint chat_receipt_order check(read_at is null or delivered_at is not null);

-- Only the recipient can acknowledge messages already fetched by their device.
create function api.ack_chat_messages(p_ids uuid[],p_read boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_couple uuid;
begin
  if p_ids is null or cardinality(p_ids)>100 or p_read is null then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  if not private.account_available(v_actor) then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  v_couple:=private.lock_active_couple(v_actor);
  if v_couple is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  update public.chat_messages set delivered_at=coalesce(delivered_at,clock_timestamp()),
    read_at=case when p_read then coalesce(read_at,clock_timestamp()) else read_at end
  where id=any(p_ids) and couple_id=v_couple and sender_id<>v_actor
    and (delivered_at is null or (p_read and read_at is null));
  return jsonb_build_object('ok',true,'data',true);
end;
$$;
revoke all on function api.ack_chat_messages(uuid[],boolean) from public,anon;
grant execute on function api.ack_chat_messages(uuid[],boolean) to authenticated;
alter table public.chat_messages replica identity full;

create table public.letter_activity (
  draw_id uuid primary key references public.draws(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('opened','reply')),
  version integer not null default 1,
  seen_version integer not null default 0,
  updated_at timestamptz not null default now(),
  discussion_at timestamptz,
  check(seen_version>=0 and seen_version<=version)
);
create index letter_activity_recipient_idx on public.letter_activity(recipient_id,couple_id);
alter table public.letter_activity enable row level security;
revoke all on public.letter_activity from anon,authenticated;
grant select on public.letter_activity to authenticated;
create policy letter_activity_select on public.letter_activity for select to authenticated
using(recipient_id=(select auth.uid()) and private.account_available((select auth.uid()))
  and private.is_active_couple_member(couple_id,(select auth.uid())));

create function private.notify_letter_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_recipient uuid;
begin
  if tg_op='UPDATE' and (new.discussion_message is not distinct from old.discussion_message
    or btrim(new.discussion_message)='') then return new; end if;
  select author_id into v_recipient from public.wishes where id=new.wish_id;
  if v_recipient is null or v_recipient=new.drawn_by then return new; end if;
  insert into public.letter_activity(draw_id,couple_id,recipient_id,kind,discussion_at)
  values(new.id,new.couple_id,v_recipient,case when tg_op='INSERT' then 'opened' else 'reply' end,new.discussion_at)
  on conflict(draw_id) do update set kind='reply',version=letter_activity.version+1,updated_at=clock_timestamp(),discussion_at=new.discussion_at;
  return new;
end;
$$;
create trigger notify_letter_activity after insert or update of discussion_message on public.draws
for each row execute function private.notify_letter_activity();
revoke all on function private.notify_letter_activity() from public,anon,authenticated;

create function api.see_letter_activity(p_draw_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_couple uuid;
begin
  if not private.account_available(auth.uid()) then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  v_couple:=private.lock_active_couple(auth.uid());
  if v_couple is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  if p_version is null or p_version<1 then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR')); end if;
  update public.letter_activity set seen_version=greatest(seen_version,p_version)
  where draw_id=p_draw_id and couple_id=v_couple and recipient_id=auth.uid() and p_version<=version;
  return jsonb_build_object('ok',true,'data',true);
end;
$$;
revoke all on function api.see_letter_activity(uuid,integer) from public,anon;
grant execute on function api.see_letter_activity(uuid,integer) to authenticated;

create function private.clear_letter_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='ended' then delete from public.letter_activity where couple_id=new.id; end if;
  return new;
end;
$$;
create trigger clear_letter_activity after update of status on public.couples
for each row execute function private.clear_letter_activity();
revoke all on function private.clear_letter_activity() from public,anon,authenticated;
alter publication supabase_realtime add table public.letter_activity;

commit;
