begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','fa000000-0000-4000-8000-000000000001','authenticated','authenticated','badge-a@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','fa000000-0000-4000-8000-000000000002','authenticated','authenticated','badge-b@example.test','',now(),'{}','{}',now(),now());
insert into public.couples (id,status) values ('fb000000-0000-4000-8000-000000000001','active');
insert into public.couple_members (couple_id,user_id) values
('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001'),
('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = 'fa000000-0000-4000-8000-000000000001';
select is(api.pending_partner_wish_count() #>> '{data}', '0', 'empty badge starts at zero');
select is(has_function_privilege('anon','api.pending_partner_wish_count()','EXECUTE'), false, 'anonymous callers cannot read count');
set local role postgres;
insert into public.wishes (id,couple_id,author_id,title,description,category,status) values
('fc000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','Thư một','','date','active'),
('fc000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','Thư hai','','gift','active'),
('fc000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','Thư tạm dừng','','date','paused'),
('fc000000-0000-4000-8000-000000000004','fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','Thư mình','','date','active');
set local role authenticated;
set local request.jwt.claim.sub = 'fa000000-0000-4000-8000-000000000001';
select is(api.pending_partner_wish_count() #>> '{data}', '2', 'only partner active unseen wishes count');
select is((select count(*)::integer from public.wishes where author_id = 'fa000000-0000-4000-8000-000000000002'), 0, 'recipient cannot read partner wish content');
select is(api.draw_wish('fd000000-0000-4000-8000-000000000001',null,null) #>> '{data,resumed}', 'false', 'first draw opens new wish');
select is(api.pending_partner_wish_count() #>> '{data}', '1', 'new draw reduces badge once');
select is(api.draw_wish('fd000000-0000-4000-8000-000000000002',null,null) #>> '{data,resumed}', 'true', 'open draw resumes');
select is(api.pending_partner_wish_count() #>> '{data}', '1', 'resuming does not reduce badge');
set local role postgres;
update public.draws set status = 'cancelled', resolved_at = now() where drawn_by = 'fa000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = 'fa000000-0000-4000-8000-000000000001';
select is(api.draw_wish('fd000000-0000-4000-8000-000000000004',
  (select d.snapshot->>'category' from public.draws d
   where d.drawn_by = 'fa000000-0000-4000-8000-000000000001' limit 1), null)
  #>> '{error,code}', 'EMPTY_POOL', 'narrow filter does not re-open old wish while unseen wish exists');
select is(api.pending_partner_wish_count() #>> '{data}', '1', 'filtered empty attempt preserves badge');
select is(api.draw_wish('fd000000-0000-4000-8000-000000000003',null,null) #>> '{data,resumed}', 'false', 'next draw opens unseen wish');
select is(api.pending_partner_wish_count() #>> '{data}', '0', 'all unseen wishes consumed');
select * from finish();
rollback;
