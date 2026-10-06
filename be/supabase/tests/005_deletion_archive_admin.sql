begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
create temporary table deletion_state(key text primary key, value jsonb) on commit drop;
grant select on deletion_state to authenticated;
insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000001','authenticated','authenticated','delete-a@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000002','authenticated','authenticated','delete-b@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000003','authenticated','authenticated','delete-admin@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','a7100000-0000-4000-8000-000000000004','authenticated','authenticated','delete-outsider@example.test','',now(),'{}','{"admin":true}',now(),now());
update public.profiles set display_name = 'Fixture deletion' where id in (
'a7100000-0000-4000-8000-000000000001','a7100000-0000-4000-8000-000000000002','a7100000-0000-4000-8000-000000000003','a7100000-0000-4000-8000-000000000004');
insert into private.admin_accounts values ('delete-admin@example.test');
select ok(exists(select 1 from private.admin_accounts where email = 'phucgp74@gmail.com'), 'requested admin email is configured');
select is(has_function_privilege('authenticated','api.prepare_account_erasure(uuid)','EXECUTE'), false, 'users cannot prepare deletion with arbitrary ID');
select is(has_function_privilege('authenticated','api.mark_account_files_removed(uuid)','EXECUTE'), false, 'users cannot mark files ready');
select is(has_table_privilege('authenticated','private.deleted_data','SELECT'), false, 'archives cannot be queried directly');
select is(has_table_privilege('authenticated','private.admin_accounts','INSERT'), false, 'users cannot grant themselves admin');
select is(has_function_privilege('anon','api.admin_deleted_data(timestamptz,uuid,text)','EXECUTE'), false, 'anonymous archive reads denied');

set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000001';
insert into deletion_state values ('invite',api.create_invite('a7300000-0000-4000-8000-000000000001'));
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000002';
insert into deletion_state select 'request',api.request_connection((select value#>>'{data,code}' from deletion_state where key='invite'),'a7300000-0000-4000-8000-000000000002');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000001';
insert into deletion_state select 'pair',api.respond_connection((select (value#>>'{data,connectionRequestId}')::uuid from deletion_state where key='request'),'accept');
insert into deletion_state values ('wish-a',api.create_wish('Mong muốn của A','','care',0,null,null,'a7300000-0000-4000-8000-000000000003'));
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000002';
insert into deletion_state values ('wish-b',api.create_wish('Mong muốn của B','','date',0,null,null,'a7300000-0000-4000-8000-000000000004'));
insert into deletion_state values ('draw-b',api.draw_wish('a7300000-0000-4000-8000-000000000005',null,null));
select is(api.admin_access()#>>'{data,allowed}','false','ordinary user is not admin');
select is(api.admin_deleted_data()#>>'{error,code}','NOT_ALLOWED','ordinary user cannot list archives');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000004';
select is(api.admin_access()#>>'{data,allowed}','false','user_metadata admin flag grants no rights');
select is(api.delete_connection_history((select (value#>>'{data,connectionRequestId}')::uuid from deletion_state where key='request'))#>>'{error,code}','NOT_ALLOWED','active request cannot be deleted as history');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000001';
insert into deletion_state select 'end',api.end_couple((select (value#>>'{data,coupleId}')::uuid from deletion_state where key='pair'),'a7300000-0000-4000-8000-000000000006');
select is((select count(*)::integer from private.connection_history where couple_id=(select (value#>>'{data,coupleId}')::uuid from deletion_state where key='pair')),2,'disconnect creates two independent history rows');
insert into deletion_state values ('history-a',api.list_connection_requests(20,null));
select is((select value#>>'{data,incoming,0,status}' from deletion_state where key='history-a'),'ended','incoming history is marked disconnected');
select is((select value#>>'{data,incoming,0,canDelete}' from deletion_state where key='history-a'),'true','incoming history has delete permission');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000002';
insert into deletion_state values ('history-b',api.list_connection_requests(20,null));
select is((select value#>>'{data,outgoing,0,canDelete}' from deletion_state where key='history-b'),'true','outgoing history has delete permission');
select is(api.delete_connection_history((select (value#>>'{data,incoming,0,id}')::uuid from deletion_state where key='history-a'))#>>'{error,code}','NOT_ALLOWED','partner cannot delete the other side');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000001';
select is(api.delete_connection_history((select (value#>>'{data,incoming,0,id}')::uuid from deletion_state where key='history-a'))#>>'{ok}','true','owner deletes history');
select is((select count(*)::integer from private.connection_history where owner_id='a7100000-0000-4000-8000-000000000001'),0,'history row is physically deleted');
select is(jsonb_array_length(api.list_connection_requests(20,null)#>'{data,incoming}'),0,'deleted accepted history is not re-created from original request');
select is((select count(*)::integer from private.connection_history where owner_id='a7100000-0000-4000-8000-000000000002'),1,'partner history remains');
select is((select count(*)::integer from private.deleted_data where source_user_id='a7100000-0000-4000-8000-000000000001' and kind='connection'),0,'deleted history is not copied to an archive');

-- Create a second live pair, then delete A while connected.
insert into deletion_state values ('invite-2',api.create_invite('a7300000-0000-4000-8000-000000000007'));
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000002';
insert into deletion_state select 'request-2',api.request_connection((select value#>>'{data,code}' from deletion_state where key='invite-2'),'a7300000-0000-4000-8000-000000000008');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000001';
insert into deletion_state select 'pair-2',api.respond_connection((select (value#>>'{data,connectionRequestId}')::uuid from deletion_state where key='request-2'),'accept');
set local request.jwt.claim.role = 'service_role';
-- Fake Storage metadata only: no real files or user data are used by this test.
update public.draws set status='completed',accepted_at=now(),completed_at=now(),resolved_at=now()
  where id=(select (value#>>'{data,id}')::uuid from deletion_state where key='draw-b');
insert into public.memories(draw_id,created_by,message,photo_storage_key)
  select (value#>>'{data,id}')::uuid,'a7100000-0000-4000-8000-000000000002','B shared memory','shared-photo-fixture'
  from deletion_state where key='draw-b';
insert into storage.objects(bucket_id,name,owner_id)
  values('couple-memories','shared-photo-fixture','a7100000-0000-4000-8000-000000000002');
insert into deletion_state values ('archive',api.prepare_account_erasure('a7100000-0000-4000-8000-000000000001'));
select is((select status from private.account_erasure_jobs where source_user_id='a7100000-0000-4000-8000-000000000001'),'pending','deletion creates a resumable job');
select is(api.prepare_account_erasure('a7100000-0000-4000-8000-000000000001')->>'id',(select value->>'id' from deletion_state where key='archive'),'prepare retry reuses archive');
select is(private.active_couple_id('a7100000-0000-4000-8000-000000000002'),null::uuid,'deletion disconnects partner');
select ok(not ((select value from deletion_state where key='archive') ? 'payload'),'job has no content snapshot');
select is((select value#>>'{files,0,name}' from deletion_state where key='archive'),'shared-photo-fixture','B photo on A related draw is included');
select ok(not ((select value#>'{files,0}' from deletion_state where key='archive') ? 'archiveKey'),'manifest has no archive destination');
select is((select count(*)::integer from private.deleted_data where source_user_id='a7100000-0000-4000-8000-000000000001'),0,'new workflow creates no legacy archive');
select throws_ok($$delete from auth.users where id='a7100000-0000-4000-8000-000000000001'$$,'P0001','use the account erasure workflow first','auth deletion is blocked before files are ready');
set local request.jwt.claim.role = 'authenticated';
select is(api.get_my_context()#>>'{data,deletionPending}','true','pending deletion can be resumed from settings');
select throws_ok($$select api.update_my_profile('Changed','Asia/Ho_Chi_Minh')$$,'42501','account deletion in progress','pending actor cannot mutate profile');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('couple-memories','pending-upload-fixture','a7100000-0000-4000-8000-000000000001')$$,'42501','account deletion in progress','pending actor cannot create a late storage object');
set local role authenticated;
select is((select count(*)::integer from public.wishes where author_id='a7100000-0000-4000-8000-000000000001'),0,'pending actor cannot read live wishes');
set local role postgres;
set local request.jwt.claim.role = 'service_role';
select throws_ok($$select api.mark_account_files_removed((select (value->>'id')::uuid from deletion_state where key='archive'))$$,'P0001','storage deletion incomplete','remaining shared photo blocks Auth deletion');
-- Simulate the Storage API's metadata effect on fake fixtures. Production uses
-- Storage API to remove bytes and never deletes storage.objects directly.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id='couple-memories' and name='shared-photo-fixture';
set local storage.allow_delete_query = 'false';
select lives_ok($$select api.mark_account_files_removed((select (value->>'id')::uuid from deletion_state where key='archive'))$$,'removed shared photo permits completion');
select lives_ok($$delete from auth.users where id='a7100000-0000-4000-8000-000000000001'$$,'Auth deletion and relational purge commit together');
select is((select count(*)::integer from public.profiles where id='a7100000-0000-4000-8000-000000000001'),0,'profile is removed');
select is((select count(*)::integer from public.wishes where author_id='a7100000-0000-4000-8000-000000000001'),0,'deleted account wishes removed');
select is((select count(*)::integer from public.draws where id=(select (value#>>'{data,id}')::uuid from deletion_state where key='draw-b')),0,'related draw removed from live DB');
select is((select count(*)::integer from public.memories where created_by='a7100000-0000-4000-8000-000000000002'),0,'related shared memory created by B is erased');
select is((select count(*)::integer from public.wishes where author_id='a7100000-0000-4000-8000-000000000002'),1,'partner own wishes preserved');
select is((select count(*)::integer from auth.users where id='a7100000-0000-4000-8000-000000000002'),1,'partner account preserved');
select is((select status from private.account_erasure_jobs where id=(select (value->>'id')::uuid from deletion_state where key='archive')),'completed','operations record survives deletion');
select ok((select source_user_id is null and files='[]'::jsonb and last_error is null and audit_expires_at > now() from private.account_erasure_jobs where id=(select (value->>'id')::uuid from deletion_state where key='archive')),'completed audit has no user ID or file paths');
select is((select count(*)::integer from private.connection_history where person_id='a7100000-0000-4000-8000-000000000001'),0,'partner history no longer contains deleted account identity');
select is(api.get_my_context()#>>'{error,code}','UNAUTHENTICATED','stale JWT cannot load deleted profile');
select is(api.list_connection_requests(20,null)#>>'{error,code}','UNAUTHENTICATED','stale JWT cannot load connection history');
set local request.jwt.claim.role = 'authenticated';
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values('couple-memories','deleted-upload-fixture','a7100000-0000-4000-8000-000000000001')$$,'42501','account deletion in progress','stale deleted-user JWT cannot create storage objects');

set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
select is(api.admin_access()#>>'{data,allowed}','false','allowlisted email alone is no longer admin');
set local request.jwt.claim.role = 'service_role';
select is(api.admin_deleted_detail((select (value->>'id')::uuid from deletion_state where key='archive'))#>>'{error,code}','NOT_ALLOWED','even service role cannot use the removed content RPC');
select ok(not ((api.admin_deleted_data(null,null,'account')->'data'->0) ?| array['payload','files','source_user_id','email','display_name']),'admin operations response contains no private user fields');
select ok(jsonb_array_length(api.admin_deleted_data(null,null,'account')->'data') >= 1,'admin can filter account archives');
set local request.jwt.claim.role = 'authenticated';
update auth.users set email_confirmed_at=null where id='a7100000-0000-4000-8000-000000000003';
select is(api.admin_access()#>>'{data,allowed}','false','unconfirmed allowlisted email is not admin');
set local request.jwt.claim.sub = 'a7100000-0000-4000-8000-000000000004';
select is(api.admin_deleted_detail((select (value->>'id')::uuid from deletion_state where key='archive'))#>>'{error,code}','NOT_ALLOWED','outsider cannot fetch guessed archive ID');
set local request.jwt.claim.role = 'service_role';
insert into deletion_state values ('delete-b',api.prepare_account_erasure('a7100000-0000-4000-8000-000000000002'));
select api.mark_account_files_removed((select (value->>'id')::uuid from deletion_state where key='delete-b'));
select lives_ok($$delete from auth.users where id='a7100000-0000-4000-8000-000000000002'$$,'B can delete after A');
select is((select count(*)::integer from private.account_erasure_jobs where source_user_id is not null),0,'A and B have no identifiers in completed jobs');
update private.account_erasure_jobs set audit_expires_at=now()-interval '1 second' where status='completed';
select is(api.purge_deletion_audit(),2::bigint,'expired operations audit is purged');
select is(has_function_privilege('authenticated','api.admin_operations()','EXECUTE'),false,'user cannot read operations');
select is(has_function_privilege('authenticated','api.purge_deletion_audit()','EXECUTE'),false,'user cannot purge audit');
select * from finish();
rollback;
