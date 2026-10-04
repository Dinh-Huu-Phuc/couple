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

select is(has_function_privilege('anon', 'api.respond_draw(uuid,text,text,timestamptz)', 'EXECUTE'), false, 'anon cannot call reply/schedule RPC');
select is(has_table_privilege('authenticated', 'public.draws', 'UPDATE'), false, 'client cannot write reply/schedule directly');

set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', 'Không phải người bốc', null) #>> '{error,code}', 'NOT_ALLOWED', 'wish author cannot change picker reply');
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000003';
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', 'Người ngoài', null) #>> '{error,code}', 'NOT_ALLOWED', 'outsider cannot send reply');
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', '   ', null) #>> '{error,code}', 'DISCUSSION_MESSAGE_REQUIRED', 'blank discussion is rejected');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', repeat('x', 1001), null) #>> '{error,code}', 'DISCUSSION_MESSAGE_REQUIRED', 'oversized discussion is rejected');
select is((select status from public.draws where id = (select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw')), 'opened', 'invalid reply does not change draw status');
insert into draw_upgrade_state select 'reply', api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', '  Đi lúc hoàng hôn nhé?  ', null);
select is((select value #>> '{data,status}' from draw_upgrade_state where key = 'reply'), 'discuss', 'valid reply transitions to discuss');
select is((select value #>> '{data,discussion_message}' from draw_upgrade_state where key = 'reply'), 'Đi lúc hoàng hôn nhé?', 'reply is persisted after trim');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', 'Đi lúc hoàng hôn nhé?', null) #>> '{data,discussion_at}', (select value #>> '{data,discussion_at}' from draw_upgrade_state where key = 'reply'), 'exact retry preserves reply timestamp');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', 'Mình đi chiều mai nhé?', null) #>> '{data,discussion_message}', 'Mình đi chiều mai nhé?', 'picker can edit the discussion reply');

set local role authenticated;
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001';
select is((select discussion_message from public.draws where id = (select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw')), 'Mình đi chiều mai nhé?', 'partner can read reply through RLS');
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.draws where couple_id = 'f2000000-0000-4000-8000-000000000001'), 0, 'outsider cannot read reply');
set local role postgres;
set local request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000002';

select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred') #>> '{error,code}', 'DEFER_TIME_REQUIRED', 'legacy RPC cannot bypass required schedule');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, null) #>> '{error,code}', 'DEFER_TIME_REQUIRED', 'missing schedule is rejected');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, statement_timestamp() - interval '1 hour') #>> '{error,code}', 'DEFER_TIME_INVALID', 'past schedule is rejected');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, 'infinity'::timestamptz) #>> '{error,code}', 'DEFER_TIME_INVALID', 'infinite schedule is rejected');
select is((select status from public.draws where id = (select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw')), 'discuss', 'invalid schedule does not close draw');
insert into draw_upgrade_state values ('when', to_jsonb(statement_timestamp() + interval '4 hours'));
insert into draw_upgrade_state select 'defer', api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, (select (value #>> '{}')::timestamptz from draw_upgrade_state where key = 'when'));
select is((select value #>> '{data,status}' from draw_upgrade_state where key = 'defer'), 'deferred', 'future schedule closes draw');
select is((select (value #>> '{data,deferred_until}')::timestamptz from draw_upgrade_state where key = 'defer'), (select (value #>> '{}')::timestamptz from draw_upgrade_state where key = 'when'), 'chosen time is persisted exactly');
select is((select eligible_after from public.wishes where id = (select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'wish')), (select (value #>> '{}')::timestamptz from draw_upgrade_state where key = 'when'), 'eligibility uses chosen time rather than 72 hours');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, (select (value #>> '{}')::timestamptz from draw_upgrade_state where key = 'when')) #>> '{data,resolved_at}', (select value #>> '{data,resolved_at}' from draw_upgrade_state where key = 'defer'), 'exact defer retry keeps resolved time');
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'deferred', null, statement_timestamp() + interval '5 hours') #>> '{error,code}', 'INVALID_TRANSITION', 'closed deferral cannot be changed');
select is(api.complete_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw')) #>> '{error,code}', 'INVALID_TRANSITION', 'deferred draw cannot be completed directly');
select is(api.draw_wish('f3000000-0000-4000-8000-000000000003', null, null) #>> '{error,code}', 'EMPTY_POOL', 'wish cannot be drawn before chosen time');
select is((select value #>> '{data,snapshot,title}' from draw_upgrade_state where key = 'defer'), 'Đi dạo', 'reply/schedule keep original snapshot intact');

insert into draw_upgrade_state values ('end', api.end_couple('f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000004'));
set local role authenticated;
select is((select count(*)::integer from public.draws where couple_id = 'f2000000-0000-4000-8000-000000000001'), 0, 'ending revokes reply and schedule visibility');
set local role postgres;
select is(api.respond_draw((select (value #>> '{data,id}')::uuid from draw_upgrade_state where key = 'draw'), 'discuss', 'Sau khi ngắt', null) #>> '{error,code}', 'NOT_ALLOWED', 'ending prevents further replies');
select * from finish();
rollback;
