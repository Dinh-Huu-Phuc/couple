begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(exists(select 1 from storage.buckets where id='couple-letter-attachments' and public=false),
  'letter attachments use a private bucket');
select is(has_table_privilege('authenticated','public.chat_messages','SELECT'),true,
  'authenticated users may select chat through RLS');
select is(has_table_privilege('authenticated','public.chat_messages','INSERT'),false,
  'browser cannot insert chat messages directly');
select is(has_function_privilege('authenticated','api.send_chat_message(text,uuid,text)','EXECUTE'),true,
  'authenticated users may call guarded chat RPC');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','ca100000-0000-4000-8000-000000000001','authenticated','authenticated','chat-a@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','ca100000-0000-4000-8000-000000000002','authenticated','authenticated','chat-b@example.test','',now(),'{}','{}',now(),now());
update public.profiles set display_name=case when id='ca100000-0000-4000-8000-000000000001' then 'An' else 'Bình' end
where id in ('ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000002');

set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000001';
create temporary table chat_state(key text primary key,value jsonb not null) on commit drop;
insert into chat_state values('invite',api.create_invite('ca110000-0000-4000-8000-000000000001'));
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000002';
insert into chat_state select 'request',api.request_connection((select value#>>'{data,code}' from chat_state where key='invite'),'ca110000-0000-4000-8000-000000000002');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000001';
insert into chat_state select 'accept',api.respond_connection((select (value#>>'{data,connectionRequestId}')::uuid from chat_state where key='request'),'accept');
insert into chat_state select 'photo',to_jsonb((value#>>'{data,coupleId}') || '/ca100000-0000-4000-8000-000000000001/ca120000-0000-4000-8000-000000000001.webp') from chat_state where key='accept';
insert into storage.objects(bucket_id,name,owner,owner_id) select bucket,value#>>'{}','ca100000-0000-4000-8000-000000000001'::uuid,'ca100000-0000-4000-8000-000000000001'
from chat_state cross join unnest(array['couple-letter-attachments','couple-chat-attachments']) bucket where key='photo';
select is(api.save_letter_draft('new',jsonb_build_object('title','Draft','description','Private draft','greeting','','closing','','signature','','templateId','cream','photoStorageKey',(select value#>>'{}' from chat_state where key='photo'),'category','care','budget','','from','','until',''))#>>'{ok}','true','draft with private photo is saved');
set local role authenticated;
select is((select count(*)::integer from public.letter_drafts),1,'author reads own draft');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.letter_drafts),0,'partner cannot read draft');
select is((select count(*)::integer from storage.objects where bucket_id='couple-letter-attachments'),0,'partner cannot read unpicked photo');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000001';
set local role postgres;
insert into chat_state values('wish',api.create_wish('Một ngày dịu dàng','Mình đi dạo nhé','date',0,null,null,
  'ca110000-0000-4000-8000-000000000003','Gửi cậu,','Thương,','An','rose',(select value#>>'{}' from chat_state where key='photo')));
select is((select count(*)::integer from public.letter_drafts),0,'sending letter removes its draft atomically');
select is(private.can_delete_letter_object((select value#>>'{}' from chat_state where key='photo'),auth.uid()),false,'committed letter photo cannot be removed by browser');
select is((select value#>>'{data,template_id}' from chat_state where key='wish'),'rose','letter template is persisted');
select is((select value#>>'{data,greeting}' from chat_state where key='wish'),'Gửi cậu,','letter greeting is persisted');

insert into chat_state values('message',api.send_chat_message('Tối nay mình gọi nhau nhé'));
select is((select value#>>'{data,body}' from chat_state where key='message'),'Tối nay mình gọi nhau nhé','member sends a chat message');
select is((select count(*)::integer from public.chat_messages),1,'message is stored once');
insert into chat_state values('photo-message',api.send_chat_message('','ca130000-0000-4000-8000-000000000001',(select value#>>'{}' from chat_state where key='photo')));
select is((select value#>>'{ok}' from chat_state where key='photo-message'),'true','image-only chat is accepted');
select is(api.send_chat_message('','ca130000-0000-4000-8000-000000000001',(select value#>>'{}' from chat_state where key='photo'))#>>'{data,id}',(select value#>>'{data,id}' from chat_state where key='photo-message'),'retry returns the same message');
select is(api.send_chat_message('changed','ca130000-0000-4000-8000-000000000001',null)#>>'{error,code}','IDEMPOTENCY_CONFLICT','same request cannot send different content');
select is(api.send_chat_message('')#>>'{error,code}','VALIDATION_ERROR','empty chat without photo is rejected');
select is(api.send_chat_message('stolen',null,replace((select value#>>'{}' from chat_state where key='photo'),'000000000001/','000000000002/'))#>>'{error,code}','NOT_ALLOWED','sender cannot reference a foreign photo');

set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*)::integer from public.chat_messages),2,'partner can read current couple chat');
select is((select count(*)::integer from storage.objects where bucket_id='couple-chat-attachments'),1,'partner reads shared chat photo');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000099';
select is((select count(*)::integer from public.chat_messages),0,'outsider cannot read chat');
select is((select count(*)::integer from storage.objects where bucket_id='couple-chat-attachments'),0,'outsider cannot read chat photo');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000002';
set local role postgres;
select is(api.send_chat_message(repeat('x',2001))#>>'{error,code}','VALIDATION_ERROR','oversized chat is rejected');
insert into storage.objects(bucket_id,name,owner,owner_id) select 'couple-chat-attachments',replace(value#>>'{}','/ca100000-0000-4000-8000-000000000001/','/ca100000-0000-4000-8000-000000000002/'),'ca100000-0000-4000-8000-000000000002'::uuid,'ca100000-0000-4000-8000-000000000002' from chat_state where key='photo';
select is(api.send_chat_message('',null,replace((select value#>>'{}' from chat_state where key='photo'),'/ca100000-0000-4000-8000-000000000001/','/ca100000-0000-4000-8000-000000000002/'))#>>'{ok}','true','partner sends a photo owned by partner');

insert into chat_state values('draw',api.draw_wish('ca110000-0000-4000-8000-000000000004','date',0));
select is((select value#>>'{data,snapshot,schemaVersion}' from chat_state where key='draw'),'2','new draws use letter snapshot version 2');
select is((select value#>>'{data,snapshot,signature}' from chat_state where key='draw'),'An','snapshot keeps the letter signature');
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='couple-letter-attachments'),1,'partner reads photo after drawing letter');
set local role postgres;
select ok(position('couple-chat-attachments' in pg_get_functiondef('api.prepare_account_erasure(uuid)'::regprocedure))>0,'account erasure includes chat attachments');
select ok(position('couple-chat-attachments' in pg_get_functiondef('private.guard_deleting_storage_actor()'::regprocedure))>0,'upload guard covers chat attachments');
insert into storage.objects(bucket_id,name,owner,owner_id) select 'couple-letter-attachments',replace(value#>>'{}','/ca100000-0000-4000-8000-000000000001/','/ca100000-0000-4000-8000-000000000002/'),'ca100000-0000-4000-8000-000000000002'::uuid,'ca100000-0000-4000-8000-000000000002' from chat_state where key='photo';
insert into chat_state values('partner-wish',api.create_wish('Partner letter','Keep my own photo','care',0,null,null,'ca140000-0000-4000-8000-000000000001','','','','cream',replace((select value#>>'{}' from chat_state where key='photo'),'/ca100000-0000-4000-8000-000000000001/','/ca100000-0000-4000-8000-000000000002/')));
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000001';
select is(api.draw_wish('ca140000-0000-4000-8000-000000000002','care',0)#>>'{ok}','true','account to erase has drawn partner letter with photo');
set local request.jwt.claim.sub='ca100000-0000-4000-8000-000000000002';

insert into chat_state select 'end',api.end_couple((select (value#>>'{data,coupleId}')::uuid from chat_state where key='accept'),
  'ca110000-0000-4000-8000-000000000005');
select is((select count(*)::integer from public.chat_messages),0,'ending the connection erases all chat messages');
select is(api.send_chat_message('Còn đó không?')#>>'{error,code}','NOT_ALLOWED','former member cannot send more messages');
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='couple-chat-attachments'),0,'former partner loses photo access immediately');
set local role postgres;
set local request.jwt.claim.role='service_role';
select is(jsonb_array_length(api.list_attachment_cleanup()),2,'ended chat photos are queued for physical cleanup, drawn letter photo stays referenced');
insert into chat_state values('erasure',api.prepare_account_erasure('ca100000-0000-4000-8000-000000000001'));
select is((select jsonb_array_length(value->'files') from chat_state where key='erasure'),3,'account erasure includes own letter photo and both partners chat photos');
select ok(not exists(select 1 from chat_state s,jsonb_array_elements(s.value->'files') f where s.key='erasure' and f->>'bucket'='couple-letter-attachments' and f->>'name' like '%/ca100000-0000-4000-8000-000000000002/%'),'erasure preserves photo referenced by surviving partner own wish');

select * from finish();
rollback;
