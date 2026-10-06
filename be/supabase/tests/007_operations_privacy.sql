begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

insert into private.deleted_data(id,kind,source_user_id,email,display_name,payload,files,status,completed_at)
values('a7500000-0000-4000-8000-000000000001','account','a7500000-0000-4000-8000-000000000002',
  'legacy-private@example.test','Private legacy name','{"letter":"private legacy content"}',
  '[{"bucket":"couple-memories","name":"old-path","archiveKey":"old-copy"}]','completed',now());
set local request.jwt.claim.role = 'service_role';
select ok(not ((api.admin_deleted_data()->'data'->0) ?| array['email','display_name','source_user_id','payload','files']),
  'legacy content and identities are excluded from operations RPC');
select is(api.admin_deleted_detail('a7500000-0000-4000-8000-000000000001')#>>'{error,code}','NOT_ALLOWED',
  'legacy content RPC always rejects access');
select is((select payload->>'letter' from private.deleted_data where id='a7500000-0000-4000-8000-000000000001'),
  'private legacy content','legacy archive is preserved pending separate cleanup approval');
select is(has_function_privilege('service_role','api.admin_deleted_detail(uuid)','EXECUTE'),false,
  'service role has no grant on obsolete content RPC');
select is(has_function_privilege('service_role','api.prepare_account_deletion(uuid)','EXECUTE'),false,
  'old snapshot workflow is disabled');
select is(has_function_privilege('anon','api.prepare_account_erasure(uuid)','EXECUTE'),false,
  'anonymous cannot initiate arbitrary erasure');
select is(has_function_privilege('authenticated','api.account_erasure_failed(uuid,text)','EXECUTE'),false,
  'user cannot alter operations status');
select is(has_table_privilege('authenticated','private.account_erasure_jobs','SELECT'),false,
  'user cannot read deletion paths directly');

insert into private.account_erasure_jobs(id,source_user_id,files,status,last_error)
values('a7500000-0000-4000-8000-000000000003','a7500000-0000-4000-8000-000000000004','[]','pending','storage');
select api.account_erasure_failed('a7500000-0000-4000-8000-000000000003','auth');
select is((select last_error from private.account_erasure_jobs where id='a7500000-0000-4000-8000-000000000003'),
  'auth','failure records only a bounded stage');
select api.account_erasure_failed('a7500000-0000-4000-8000-000000000003','private-content');
select is((select last_error from private.account_erasure_jobs where id='a7500000-0000-4000-8000-000000000003'),
  'auth','arbitrary error payload cannot enter operations log');
select api.purge_deletion_audit();
select ok(exists(select 1 from private.account_erasure_jobs where id='a7500000-0000-4000-8000-000000000003'),
  'pending jobs are not expired');
select ok(exists(select 1 from private.deleted_data where id='a7500000-0000-4000-8000-000000000001'),
  'audit purge never changes legacy archive');
select ok(exists(select 1 from cron.job where jobname='couple-purge-erasure-audit'
  and command='select api.purge_deletion_audit();'),'daily audit purge is scheduled');
set local request.jwt.claim.role = 'authenticated';
select is(api.admin_operations()#>>'{error,code}','NOT_ALLOWED','ordinary user cannot get operations statistics');
select * from finish();
rollback;
