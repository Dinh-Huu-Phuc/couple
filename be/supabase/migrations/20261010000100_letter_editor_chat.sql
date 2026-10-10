begin;

alter table public.wishes
  add column greeting text not null default 'Gửi cậu thương,',
  add column closing text not null default 'Thương,',
  add column signature text not null default '',
  add column template_id text not null default 'cream',
  add column photo_storage_key text;

alter table public.wishes
  add constraint wishes_greeting_check check (char_length(greeting) <= 120),
  add constraint wishes_closing_check check (char_length(closing) <= 120),
  add constraint wishes_signature_check check (char_length(signature) <= 80),
  add constraint wishes_template_check check (template_id in ('cream', 'rose', 'classic')),
  add constraint wishes_photo_key_check check (
    photo_storage_key is null or photo_storage_key ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.webp$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-letter-attachments', 'couple-letter-attachments', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function private.can_upload_letter_object(p_name text, p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_couple_id uuid;
  v_uploader_id uuid;
begin
  if p_user_id is null or array_length(v_parts, 1) <> 3
     or v_parts[1] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[2] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[3] !~ '^[0-9a-fA-F-]{36}\.webp$' then
    return false;
  end if;
  begin
    v_couple_id := v_parts[1]::uuid;
    v_uploader_id := v_parts[2]::uuid;
  exception when invalid_text_representation then return false;
  end;
  return v_uploader_id = p_user_id
    and private.is_active_couple_member(v_couple_id, p_user_id);
end;
$$;

create table public.letter_drafts (
  author_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  slot text not null check (slot = 'new' or slot ~ '^[0-9a-fA-F-]{36}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (author_id, couple_id, slot)
);

create function private.can_read_letter_object(p_name text, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.wishes w
      where w.photo_storage_key = p_name and w.author_id = p_user_id
    )
    or exists (
      select 1 from public.letter_drafts d where d.payload->>'photoStorageKey'=p_name
        and d.author_id=p_user_id and private.is_active_couple_member(d.couple_id,p_user_id)
    )
    or exists (
      select 1 from public.draws d
      where d.snapshot->>'photoStorageKey' = p_name
        and private.is_active_couple_member(d.couple_id, p_user_id)
    )
  );
$$;

alter table public.letter_drafts enable row level security;
revoke all on public.letter_drafts from anon, authenticated;
grant select on public.letter_drafts to authenticated;
create policy letter_drafts_author on public.letter_drafts for select to authenticated
using (author_id = (select auth.uid()) and private.is_active_couple_member(couple_id,(select auth.uid()))
  and private.account_available((select auth.uid())));

create function private.can_delete_letter_object(p_name text, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_upload_letter_object(p_name, p_user_id)
    and not exists (select 1 from public.wishes w where w.photo_storage_key = p_name)
    and not exists (select 1 from public.letter_drafts d where d.payload->>'photoStorageKey' = p_name)
    and not exists (
      select 1 from public.draws d where d.snapshot->>'photoStorageKey' = p_name
    );
$$;

create policy couple_letter_attachments_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'couple-letter-attachments'
  and private.can_upload_letter_object(name, (select auth.uid()))
);
create policy couple_letter_attachments_select on storage.objects for select to authenticated
using (
  bucket_id = 'couple-letter-attachments'
  and private.can_read_letter_object(name, (select auth.uid()))
);
create policy couple_letter_attachments_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'couple-letter-attachments'
  and private.can_delete_letter_object(name, (select auth.uid()))
);

revoke all on function private.can_upload_letter_object(text, uuid),
  private.can_read_letter_object(text, uuid), private.can_delete_letter_object(text, uuid)
  from public, anon;
grant execute on function private.can_upload_letter_object(text, uuid),
  private.can_read_letter_object(text, uuid), private.can_delete_letter_object(text, uuid)
  to authenticated;

create function private.validate_letter_photo(p_key text, p_couple_id uuid, p_actor uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_key is null or (
    p_key like p_couple_id::text || '/' || p_actor::text || '/%'
    and p_key ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.webp$'
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'couple-letter-attachments' and o.name = p_key
        and (o.owner = p_actor or o.owner_id = p_actor::text)
    )
  );
$$;
revoke all on function private.validate_letter_photo(text, uuid, uuid) from public, anon, authenticated;

create function api.save_letter_draft(p_slot text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_couple uuid; v_error jsonb; v_key text;
begin
  v_error := private.rate_limit_error('save_letter_draft',120,3600);
  if v_error is not null then return v_error; end if;
  v_couple := private.lock_active_couple(v_actor);
  if v_couple is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  if p_slot is null or (p_slot <> 'new' and p_slot !~ '^[0-9a-fA-F-]{36}$')
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>20000 then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  if p_slot <> 'new' and not exists(select 1 from public.wishes w where w.id::text=p_slot and w.author_id=v_actor and w.couple_id=v_couple) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  foreach v_key in array array['title','description','greeting','closing','signature','templateId','category','budget','from','until'] loop
    if jsonb_typeof(p_payload->v_key) is distinct from 'string' then
      return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
    end if;
  end loop;
  if char_length(p_payload->>'title')>120 or char_length(p_payload->>'description')>2000
    or char_length(p_payload->>'greeting')>120 or char_length(p_payload->>'closing')>120
    or char_length(p_payload->>'signature')>80 or char_length(p_payload->>'budget')>20
    or char_length(p_payload->>'from')>30 or char_length(p_payload->>'until')>30
    or p_payload->>'templateId' not in ('cream','rose','classic')
    or p_payload->>'category' not in ('food','gift','date','care','experience','other')
    or not private.validate_letter_photo(p_payload->>'photoStorageKey',v_couple,v_actor) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  insert into public.letter_drafts(author_id,couple_id,slot,payload)
  values(v_actor,v_couple,p_slot,p_payload)
  on conflict(author_id,couple_id,slot) do update set payload=excluded.payload,updated_at=now();
  return jsonb_build_object('ok',true,'data',true);
end;
$$;
create function api.delete_letter_draft(p_slot text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_couple uuid; v_error jsonb;
begin
  v_error:=private.rate_limit_error('save_letter_draft',120,3600);
  if v_error is not null then return v_error; end if;
  v_couple:=private.lock_active_couple(auth.uid());
  if v_couple is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  delete from public.letter_drafts where author_id=auth.uid() and couple_id=v_couple and slot=p_slot;
  return jsonb_build_object('ok',true,'data',true);
end;
$$;
revoke all on function api.save_letter_draft(text,jsonb),api.delete_letter_draft(text) from public,anon;
grant execute on function api.save_letter_draft(text,jsonb),api.delete_letter_draft(text) to authenticated;

create function private.create_letter_wish_impl(
  p_title text, p_description text, p_category text, p_budget_vnd bigint,
  p_available_from timestamptz, p_expires_at timestamptz, p_request_id uuid,
  p_greeting text, p_closing text, p_signature text, p_template_id text,
  p_photo_storage_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_couple_id uuid;
  v_title text := btrim(p_title);
  v_description text := coalesce(p_description, '');
  v_greeting text := coalesce(p_greeting, '');
  v_closing text := coalesce(p_closing, '');
  v_signature text := coalesce(p_signature, '');
  v_payload_hash text;
  v_existing_hash text;
  v_wish_id uuid;
  v_wish jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','UNAUTHENTICATED')); end if;
  if not private.is_email_verified(v_actor) then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','EMAIL_NOT_VERIFIED')); end if;
  if p_request_id is null or char_length(v_title) not between 1 and 120
     or char_length(v_description) > 2000 or char_length(v_greeting) > 120
     or char_length(v_closing) > 120 or char_length(v_signature) > 80
     or p_template_id not in ('cream','rose','classic')
     or p_category not in ('food','gift','date','care','experience','other')
     or (p_budget_vnd is not null and p_budget_vnd not between 0 and 1000000000)
     or (p_available_from is not null and p_expires_at is not null and p_expires_at <= p_available_from)
     or (p_expires_at is not null and p_expires_at <= statement_timestamp()) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null or not private.validate_letter_photo(p_photo_storage_key, v_couple_id, v_actor) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  v_payload_hash := private.sha256_text(jsonb_build_object(
    'title',v_title,'description',v_description,'category',p_category,'budgetVnd',p_budget_vnd,
    'availableFrom',p_available_from,'expiresAt',p_expires_at,'greeting',v_greeting,
    'closing',v_closing,'signature',v_signature,'templateId',p_template_id,
    'photoStorageKey',p_photo_storage_key
  )::text);
  select i.payload_hash,i.result_id into v_existing_hash,v_wish_id
  from private.idempotency_requests i
  where i.actor_id=v_actor and i.action='create_wish' and i.request_id=p_request_id;
  if found then
    if v_existing_hash <> v_payload_hash then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','IDEMPOTENCY_CONFLICT')); end if;
    select to_jsonb(w) into v_wish from public.wishes w where w.id=v_wish_id and w.author_id=v_actor;
    return jsonb_build_object('ok',true,'data',v_wish);
  end if;
  if (select count(*) from public.wishes w where w.couple_id=v_couple_id and w.author_id=v_actor and w.status<>'archived') >= 200 then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','WISH_LIMIT_REACHED'));
  end if;
  insert into public.wishes(couple_id,author_id,title,description,category,budget_vnd,available_from,expires_at,
    greeting,closing,signature,template_id,photo_storage_key)
  values(v_couple_id,v_actor,v_title,v_description,p_category,p_budget_vnd,p_available_from,p_expires_at,
    v_greeting,v_closing,v_signature,p_template_id,p_photo_storage_key)
  returning id,to_jsonb(wishes) into v_wish_id,v_wish;
  insert into private.idempotency_requests(actor_id,action,request_id,payload_hash,result_id)
  values(v_actor,'create_wish',p_request_id,v_payload_hash,v_wish_id);
  delete from public.letter_drafts where author_id=v_actor and couple_id=v_couple_id and slot='new';
  return jsonb_build_object('ok',true,'data',v_wish);
end;
$$;

create function private.update_letter_wish_impl(
  p_wish_id uuid, p_expected_version integer, p_title text, p_description text,
  p_category text, p_budget_vnd bigint, p_available_from timestamptz,
  p_expires_at timestamptz, p_greeting text, p_closing text, p_signature text,
  p_template_id text, p_photo_storage_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_couple_id uuid; v_current public.wishes%rowtype; v_result jsonb;
  v_title text := btrim(p_title); v_description text := coalesce(p_description,'');
  v_greeting text := coalesce(p_greeting,''); v_closing text := coalesce(p_closing,'');
  v_signature text := coalesce(p_signature,'');
begin
  if v_actor is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','UNAUTHENTICATED')); end if;
  if char_length(v_title) not between 1 and 120 or char_length(v_description)>2000
     or char_length(v_greeting)>120 or char_length(v_closing)>120 or char_length(v_signature)>80
     or p_template_id not in ('cream','rose','classic')
     or p_category not in ('food','gift','date','care','experience','other')
     or (p_budget_vnd is not null and p_budget_vnd not between 0 and 1000000000)
     or (p_available_from is not null and p_expires_at is not null and p_expires_at<=p_available_from)
     or (p_expires_at is not null and p_expires_at<=statement_timestamp()) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR'));
  end if;
  v_couple_id := private.lock_active_couple(v_actor);
  if v_couple_id is null or not private.validate_letter_photo(p_photo_storage_key,v_couple_id,v_actor) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
  end if;
  select * into v_current from public.wishes w
  where w.id=p_wish_id and w.couple_id=v_couple_id and w.author_id=v_actor for update;
  if not found then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  if v_current.version<>p_expected_version then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','STALE_VERSION')); end if;
  if v_current.status not in ('active','paused') then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','INVALID_TRANSITION')); end if;
  if exists(select 1 from public.draws d where d.wish_id=p_wish_id and d.status in ('opened','accepted','discuss')) then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','WISH_BUSY'));
  end if;
  update public.wishes w set title=v_title,description=v_description,category=p_category,
    budget_vnd=p_budget_vnd,available_from=p_available_from,expires_at=p_expires_at,
    greeting=v_greeting,closing=v_closing,signature=v_signature,template_id=p_template_id,
    photo_storage_key=p_photo_storage_key,version=version+1
  where w.id=p_wish_id returning to_jsonb(w) into v_result;
  delete from public.letter_drafts where author_id=v_actor and couple_id=v_couple_id and slot=p_wish_id::text;
  return jsonb_build_object('ok',true,'data',v_result);
end;
$$;

drop function api.create_wish(text,text,text,bigint,timestamptz,timestamptz,uuid);
drop function api.update_wish(uuid,integer,text,text,text,bigint,timestamptz,timestamptz);

create function api.create_wish(
  p_title text, p_description text default '', p_category text default 'other',
  p_budget_vnd bigint default null, p_available_from timestamptz default null,
  p_expires_at timestamptz default null, p_request_id uuid default null,
  p_greeting text default 'Gửi cậu thương,', p_closing text default 'Thương,',
  p_signature text default '', p_template_id text default 'cream',
  p_photo_storage_key text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('create_wish',30,3600);
  if v_error is not null then return v_error; end if;
  return private.create_letter_wish_impl(p_title,p_description,p_category,p_budget_vnd,p_available_from,
    p_expires_at,p_request_id,p_greeting,p_closing,p_signature,p_template_id,p_photo_storage_key);
end;
$$;

create function api.update_wish(
  p_wish_id uuid, p_expected_version integer, p_title text, p_description text,
  p_category text, p_budget_vnd bigint, p_available_from timestamptz,
  p_expires_at timestamptz, p_greeting text default 'Gửi cậu thương,',
  p_closing text default 'Thương,', p_signature text default '',
  p_template_id text default 'cream', p_photo_storage_key text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('update_wish',120,3600);
  if v_error is not null then return v_error; end if;
  return private.update_letter_wish_impl(p_wish_id,p_expected_version,p_title,p_description,p_category,
    p_budget_vnd,p_available_from,p_expires_at,p_greeting,p_closing,p_signature,p_template_id,p_photo_storage_key);
end;
$$;

revoke all on function private.create_letter_wish_impl(text,text,text,bigint,timestamptz,timestamptz,uuid,text,text,text,text,text),
  private.update_letter_wish_impl(uuid,integer,text,text,text,bigint,timestamptz,timestamptz,text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function api.create_wish(text,text,text,bigint,timestamptz,timestamptz,uuid,text,text,text,text,text),
  api.update_wish(uuid,integer,text,text,text,bigint,timestamptz,timestamptz,text,text,text,text,text)
  from public,anon;
grant execute on function api.create_wish(text,text,text,bigint,timestamptz,timestamptz,uuid,text,text,text,text,text),
  api.update_wish(uuid,integer,text,text,text,bigint,timestamptz,timestamptz,text,text,text,text,text)
  to authenticated;

create function private.enrich_draw_letter_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wish public.wishes%rowtype;
begin
  select * into strict v_wish from public.wishes where id=new.wish_id;
  new.snapshot := new.snapshot || jsonb_build_object(
    'schemaVersion',2,'greeting',v_wish.greeting,'closing',v_wish.closing,
    'signature',v_wish.signature,'templateId',v_wish.template_id,
    'photoStorageKey',v_wish.photo_storage_key
  );
  return new;
end;
$$;
create trigger enrich_draw_letter_snapshot before insert on public.draws
for each row execute function private.enrich_draw_letter_snapshot();
revoke all on function private.enrich_draw_letter_snapshot() from public,anon,authenticated;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_check check (char_length(btrim(body)) between 1 and 2000),
  constraint chat_messages_sender_member_fk foreign key(couple_id,sender_id)
    references public.couple_members(couple_id,user_id) on delete cascade
);
create index chat_messages_couple_created_idx on public.chat_messages(couple_id,created_at desc,id desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
create policy chat_messages_select_active_couple on public.chat_messages for select to authenticated
using (private.is_active_couple_member(couple_id,(select auth.uid())));
create policy account_not_banned on public.chat_messages as restrictive for select to authenticated
using (private.account_available((select auth.uid())));
create trigger guard_banned_actor before insert or update or delete on public.chat_messages
for each row execute function private.guard_banned_actor();

create function private.send_chat_message_impl(p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_couple_id uuid; v_body text:=btrim(p_body); v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','UNAUTHENTICATED')); end if;
  if char_length(v_body) not between 1 and 2000 then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','VALIDATION_ERROR')); end if;
  v_couple_id:=private.lock_active_couple(v_actor);
  if v_couple_id is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  insert into public.chat_messages(couple_id,sender_id,body) values(v_couple_id,v_actor,v_body)
  returning to_jsonb(chat_messages) into v_result;
  return jsonb_build_object('ok',true,'data',v_result);
end;
$$;
create function api.send_chat_message(p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_error jsonb;
begin
  v_error:=private.rate_limit_error('send_chat_message',120,60);
  if v_error is not null then return v_error; end if;
  return private.send_chat_message_impl(p_body);
end;
$$;
revoke all on function private.send_chat_message_impl(text) from public,anon,authenticated;
revoke all on function api.send_chat_message(text) from public,anon;
grant execute on function api.send_chat_message(text) to authenticated;

create function private.erase_chat_when_couple_ends()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='active' and new.status='ended' then
    delete from public.chat_messages where couple_id=new.id;
    delete from public.letter_drafts where couple_id=new.id;
  end if;
  return new;
end;
$$;
create trigger erase_chat_when_couple_ends after update of status on public.couples
for each row execute function private.erase_chat_when_couple_ends();
revoke all on function private.erase_chat_when_couple_ends() from public,anon,authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
exception when duplicate_object then null;
end $$;

-- Extend account-erasure file manifests and write guards to the new private bucket.
do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('api.prepare_account_erasure(uuid)'::regprocedure);
  if strpos(v_definition, 'where s.bucket_id = ''couple-memories'' and (')=0 then
    raise exception 'unexpected prepare_account_erasure definition';
  end if;
  execute replace(v_definition,
    'where s.bucket_id = ''couple-memories'' and (',
    'where s.bucket_id in (''couple-memories'',''couple-letter-attachments'') and (');
end;
$$;

create or replace function private.guard_deleting_storage_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()='authenticated' and new.bucket_id in ('couple-memories','couple-letter-attachments') then
    perform 1 from public.profiles where id=auth.uid() for no key update;
    if not found or exists(select 1 from private.deleted_data where kind='account' and source_user_id=auth.uid())
      or exists(select 1 from private.account_erasure_jobs where source_user_id=auth.uid()) then
      raise exception using errcode='42501',message='account deletion in progress';
    end if;
    if new.bucket_id='couple-memories' and not exists(
      select 1 from public.draws d join public.couples c on c.id=d.couple_id
      where d.id::text=split_part(new.name,'/',2) and c.id::text=split_part(new.name,'/',1)
        and d.drawn_by=auth.uid() and d.status='completed' and c.status='active'
    ) then raise exception using errcode='42501',message='memory upload no longer allowed'; end if;
    if new.bucket_id='couple-letter-attachments' and not private.can_upload_letter_object(new.name,auth.uid()) then
      raise exception using errcode='42501',message='letter upload no longer allowed';
    end if;
  end if;
  return new;
end;
$$;

create policy account_not_banned_letter_attachments on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'couple-letter-attachments' or private.account_available((select auth.uid())));

commit;
