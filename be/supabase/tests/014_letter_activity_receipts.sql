begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temporary table draw_upgrade_state (key text primary key, value jsonb) on commit drop;
grant select on draw_upgrade_state to authenticated;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reply-a@example.test', '', now(), '{}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reply-b@example.test', '', now(), '{}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reply-c@example.test', '', now(), '{}', '{}', now(), now());
update public.profiles set display_name = 'Người thử' where id in ('f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003');
insert into public.couples (id, status) values ('f2000000-0000-4000-8000-000000000001', 'active');
insert into public.couple_members (couple_id, user_id) values
('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002');

set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
insert into draw_upgrade_state values ('wish', api.create_wish('Đi dạo', '', 'date', 0, null, null, 'f3000000-0000-4000-8000-000000000001'));
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';
insert into draw_upgrade_state values ('draw', api.draw_wish('f3000000-0000-4000-8000-000000000002', null, null));

select is((select count(*)::integer from public.letter_activity),1,'opening creates one letter notification');
select is(has_table_privilege('authenticated','public.letter_activity','UPDATE'),false,'browser cannot forge seen state');
select is(has_function_privilege('anon','api.ack_chat_messages(uuid[],boolean)','EXECUTE'),false,'anonymous cannot acknowledge chat');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.letter_activity),1,'author sees their notification');
select is(jsonb_array_length(api.list_letter_activity()->'data'),1,'RPC returns current unread notification');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.letter_activity),0,'outsider cannot see notification');
select is(jsonb_array_length(api.list_letter_activity()->'data'),0,'outsider RPC cannot reveal letters');
set local role postgres;
select is(api.see_letter_activity((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),1)#>>'{ok}','false','unpaired outsider cannot acknowledge notification');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000002';
select api.respond_draw((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),'discuss','Reply one',null);
select is((select version from public.letter_activity),2,'reply increments activity version');
select api.respond_draw((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),'discuss','Reply one',null);
select is((select version from public.letter_activity),2,'same reply retry does not duplicate notification');
select api.see_letter_activity((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),2);
select is((select seen_version from public.letter_activity),0,'picker cannot acknowledge author notification');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000001';
select api.see_letter_activity((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),1);
select is((select seen_version from public.letter_activity),1,'seeing old version leaves newer reply unread');
select api.see_letter_activity((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),99);
select is((select seen_version from public.letter_activity),1,'future version cannot hide subsequent activity');
select api.see_letter_activity((select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='draw'),2);
select is((select seen_version from public.letter_activity),2,'author acknowledges current reply');
select is(jsonb_array_length(api.list_letter_activity()->'data'),0,'read notifications leave unread list');
insert into draw_upgrade_state values('chat',api.send_chat_message('Receipt test','f3000000-0000-4000-8000-000000000008',null));
select is(api.send_chat_message_to_couple('f2000000-0000-4000-8000-000000000099','Wrong pair','f3000000-0000-4000-8000-000000000007',null)#>>'{error,code}','NOT_ALLOWED','queued send cannot reach another couple');
select api.ack_chat_messages(array[(select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='chat')],true);
select ok((select read_at is null from public.chat_messages where body='Receipt test'),'sender cannot mark own message read');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000003';
select is(api.ack_chat_messages(array[(select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='chat')],true)#>>'{ok}','false','outsider cannot forge chat receipt');
set local request.jwt.claim.sub='f1000000-0000-4000-8000-000000000002';
select api.ack_chat_messages(array[(select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='chat')],false);
select ok((select delivered_at is not null and read_at is null from public.chat_messages where body='Receipt test'),'delivery alone does not mean read');
select api.ack_chat_messages(array[(select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='chat')],true);
select ok((select delivered_at<=read_at from public.chat_messages where body='Receipt test'),'recipient reads after delivery');
insert into draw_upgrade_state select 'read-time',to_jsonb(read_at) from public.chat_messages where body='Receipt test';
select api.ack_chat_messages(array[(select (value#>>'{data,id}')::uuid from draw_upgrade_state where key='chat')],true);
select is((select to_jsonb(read_at) from public.chat_messages where body='Receipt test'),(select value from draw_upgrade_state where key='read-time'),'repeated receipt preserves first read time');
select api.end_couple('f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000009');
select is((select count(*)::integer from public.letter_activity),0,'disconnect removes notifications');
select is((select count(*)::integer from public.chat_messages where body='Receipt test'),0,'disconnect removes messages and receipts');
select * from finish();
rollback;
