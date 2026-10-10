begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('couple-chat-attachments','couple-chat-attachments',false,5242880,array['image/webp']);

alter table public.chat_messages add column request_id uuid not null default gen_random_uuid(),
  add column photo_storage_key text;
alter table public.chat_messages drop constraint chat_messages_body_check,
  add constraint chat_messages_content_check check (
    char_length(body)<=2000 and (char_length(btrim(body))>0 or photo_storage_key is not null)),
  add constraint chat_messages_request_unique unique(sender_id,request_id);

create index chat_messages_photo_idx on public.chat_messages(photo_storage_key) where photo_storage_key is not null;
create index wishes_photo_idx on public.wishes(photo_storage_key) where photo_storage_key is not null;
create index letter_drafts_photo_idx on public.letter_drafts((payload->>'photoStorageKey')) where payload->>'photoStorageKey' is not null;
create index draws_letter_photo_idx on public.draws((snapshot->>'photoStorageKey')) where snapshot->>'photoStorageKey' is not null;

create policy couple_chat_attachments_insert on storage.objects for insert to authenticated
with check(bucket_id='couple-chat-attachments' and private.can_upload_letter_object(name,(select auth.uid())));
create policy couple_chat_attachments_select on storage.objects for select to authenticated
using(bucket_id='couple-chat-attachments' and private.account_available((select auth.uid())) and exists(
  select 1 from public.chat_messages m where m.photo_storage_key=name
    and private.is_active_couple_member(m.couple_id,(select auth.uid()))));
create policy couple_chat_attachments_delete on storage.objects for delete to authenticated
using(bucket_id='couple-chat-attachments' and private.can_upload_letter_object(name,(select auth.uid()))
  and not exists(select 1 from public.chat_messages m where m.photo_storage_key=name));

drop function api.send_chat_message(text);
create function api.send_chat_message(p_body text,p_request_id uuid default null,p_photo_storage_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_couple uuid; v_error jsonb; v_result public.chat_messages%rowtype;
begin
  v_error:=private.rate_limit_error('send_chat_message',120,60);
  if v_error is not null then return v_error; end if;
  if p_body is null or char_length(p_body)>2000 or (char_length(btrim(p_body))=0 and p_photo_storage_key is null) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  v_couple:=private.lock_active_couple(v_actor);
  if v_couple is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  if p_request_id is not null then
    select * into v_result from public.chat_messages where sender_id=v_actor and request_id=p_request_id;
    if found then
      if v_result.couple_id<>v_couple or v_result.body<>p_body or v_result.photo_storage_key is distinct from p_photo_storage_key then
        return jsonb_build_object('ok',false,'error',jsonb_build_object('code','IDEMPOTENCY_CONFLICT'));
      end if;
      return jsonb_build_object('ok',true,'data',to_jsonb(v_result));
    end if;
  end if;
  if p_photo_storage_key is not null and not (
    private.can_upload_letter_object(p_photo_storage_key,v_actor) and
    exists(select 1 from storage.objects o where o.bucket_id='couple-chat-attachments' and o.name=p_photo_storage_key
      and (o.owner=v_actor or o.owner_id=v_actor::text))
    and not exists(select 1 from private.attachment_cleanup a where a.bucket='couple-chat-attachments' and a.name=p_photo_storage_key and a.claimed)) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  insert into public.chat_messages(couple_id,sender_id,body,request_id,photo_storage_key)
  values(v_couple,v_actor,p_body,coalesce(p_request_id,gen_random_uuid()),p_photo_storage_key) returning * into v_result;
  return jsonb_build_object('ok',true,'data',to_jsonb(v_result));
end;
$$;
revoke all on function api.send_chat_message(text,uuid,text) from public,anon;
grant execute on function api.send_chat_message(text,uuid,text) to authenticated;

create table private.attachment_cleanup (
  bucket text not null check(bucket in ('couple-letter-attachments','couple-chat-attachments')),
  name text not null,
  created_at timestamptz not null default now(),
  claimed boolean not null default false,
  primary key(bucket,name)
);
revoke all on private.attachment_cleanup from public,anon,authenticated;
create function private.track_attachment_upload()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.bucket_id in ('couple-letter-attachments','couple-chat-attachments') then
    insert into private.attachment_cleanup(bucket,name) values(new.bucket_id,new.name) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger track_attachment_upload after insert on storage.objects
for each row execute function private.track_attachment_upload();
revoke all on function private.track_attachment_upload() from public,anon,authenticated;

create or replace function private.validate_letter_photo(p_key text,p_couple_id uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_key is null or (
    p_key like p_couple_id::text || '/' || p_actor::text || '/%'
    and p_key ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.webp$'
    and exists(select 1 from storage.objects o where o.bucket_id='couple-letter-attachments' and o.name=p_key
      and (o.owner=p_actor or o.owner_id=p_actor::text))
    and not exists(select 1 from private.attachment_cleanup a where a.bucket='couple-letter-attachments' and a.name=p_key and a.claimed)
  );
$$;

create function api.list_attachment_cleanup()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_file record; v_result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  for v_file in select a.bucket,a.name from private.attachment_cleanup a where
    ((a.created_at<now()-interval '1 hour') or exists(select 1 from public.couples c where c.id::text=split_part(a.name,'/',1) and c.status='ended'))
    and not exists(select 1 from public.chat_messages m where a.bucket='couple-chat-attachments' and m.photo_storage_key=a.name)
    and not exists(select 1 from public.wishes w where a.bucket='couple-letter-attachments' and w.photo_storage_key=a.name)
    and not exists(select 1 from public.letter_drafts d where a.bucket='couple-letter-attachments' and d.payload->>'photoStorageKey'=a.name)
    and not exists(select 1 from public.draws d where a.bucket='couple-letter-attachments' and d.snapshot->>'photoStorageKey'=a.name)
    order by a.created_at limit 100 for update of a skip locked loop
    perform 1 from public.couples where id::text=split_part(v_file.name,'/',1) for update;
    if not exists(select 1 from public.chat_messages m where v_file.bucket='couple-chat-attachments' and m.photo_storage_key=v_file.name)
      and not exists(select 1 from public.wishes w where v_file.bucket='couple-letter-attachments' and w.photo_storage_key=v_file.name)
      and not exists(select 1 from public.letter_drafts d where v_file.bucket='couple-letter-attachments' and d.payload->>'photoStorageKey'=v_file.name)
      and not exists(select 1 from public.draws d where v_file.bucket='couple-letter-attachments' and d.snapshot->>'photoStorageKey'=v_file.name) then
      update private.attachment_cleanup set claimed=true where bucket=v_file.bucket and name=v_file.name;
      v_result:=v_result || jsonb_build_array(jsonb_build_object('bucket',v_file.bucket,'name',v_file.name));
    end if;
  end loop;
  return v_result;
end;
$$;
create function api.complete_attachment_cleanup(p_bucket text,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_name) then raise exception 'file still exists'; end if;
  delete from private.attachment_cleanup where bucket=p_bucket and name=p_name;
end;
$$;
revoke all on function api.list_attachment_cleanup(),api.complete_attachment_cleanup(text,text) from public,anon,authenticated;
grant execute on function api.list_attachment_cleanup(),api.complete_attachment_cleanup(text,text) to service_role;

do $$ declare v_definition text;
begin
  v_definition:=pg_get_functiondef('private.guard_deleting_storage_actor()'::regprocedure);
  execute replace(replace(v_definition,
    '''couple-memories'',''couple-letter-attachments''','''couple-memories'',''couple-letter-attachments'',''couple-chat-attachments'''),
    'new.bucket_id=''couple-letter-attachments''','new.bucket_id in (''couple-letter-attachments'',''couple-chat-attachments'')');
  v_definition:=pg_get_functiondef('api.prepare_account_erasure(uuid)'::regprocedure);
  execute replace(replace(v_definition,
    '''couple-memories'',''couple-letter-attachments''','''couple-memories'',''couple-letter-attachments'',''couple-chat-attachments'''),
    'or split_part(s.name,''/'',2)',
    'or (s.bucket_id = ''couple-letter-attachments'' and s.name in (select d.snapshot->>''photoStorageKey'' from public.draws d where d.id=any(v_draws)) and not exists(select 1 from public.wishes w where w.photo_storage_key=s.name and w.author_id<>p_user_id)) or (s.bucket_id = ''couple-chat-attachments'' and split_part(s.name, ''/'', 1) = any(select c::text from unnest(v_couples) c)) or split_part(s.name,''/'',2)');
end $$;

commit;
