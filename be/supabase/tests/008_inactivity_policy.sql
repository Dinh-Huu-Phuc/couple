begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is(api.inactivity_policy()->>'days','45','default is 45 days');
select is(has_function_privilege('anon','api.inactivity_policy()','EXECUTE'),true,'signup can read only public policy');
select is(has_function_privilege('anon','api.admin_activity_accounts(uuid)','EXECUTE'),false,'anonymous cannot list identities');
select is(has_function_privilege('authenticated','api.admin_update_inactivity_policy(integer,integer)','EXECUTE'),false,'ordinary users cannot set retention');
select is(has_function_privilege('authenticated','api.prepare_inactive_account_erasure(uuid)','EXECUTE'),false,'ordinary users cannot erase other accounts');
select is(has_table_privilege('authenticated','private.account_activity','UPDATE'),false,'activity evidence cannot be forged directly');

insert into auth.users(id,email,raw_user_meta_data) values
 ('a7800000-0000-4000-8000-000000000001','inactive@example.test','{"inactivity_consent":true,"inactivity_version":1,"inactivity_days":45}'),
 ('a7800000-0000-4000-8000-000000000002','recent@example.test','{"inactivity_consent":true,"inactivity_version":1,"inactivity_days":45}'),
 ('a7800000-0000-4000-8000-000000000003','unaccepted@example.test','{}');
select is((select consent_version from private.account_activity where user_id='a7800000-0000-4000-8000-000000000001'),1,'signup evidence recorded');
select is((select consent_version from private.account_activity where user_id='a7800000-0000-4000-8000-000000000003'),null::integer,'no implied consent');
update private.account_activity set last_seen_at=statement_timestamp()-interval '46 days'
  where user_id in ('a7800000-0000-4000-8000-000000000001','a7800000-0000-4000-8000-000000000003');
set local request.jwt.claim.role='service_role';
select is(jsonb_array_length(api.inactive_account_candidates()),1,'only stale consenting user eligible');
select ok(not ((api.admin_activity_accounts()->0) ?| array['wishes','memories','payload','password']), 'no content in account list');
select throws_ok($$select api.prepare_inactive_account_erasure('a7800000-0000-4000-8000-000000000002')$$,
  'P0001','account not eligible','recent user rejected');
select throws_ok($$select api.prepare_inactive_account_erasure('a7800000-0000-4000-8000-000000000003')$$,
  'P0001','account not eligible','unaccepted user rejected');
select throws_ok($$select api.admin_update_inactivity_policy(0,1)$$,'P0001','invalid days','zero days rejected');
select throws_ok($$select api.admin_update_inactivity_policy(3651,1)$$,'P0001','invalid days','unbounded days rejected');
select is(api.admin_update_inactivity_policy(30,1)->>'version','2','admin changes threshold and version');
select is(jsonb_array_length(api.inactive_account_candidates()),0,'old consent cannot be applied to changed threshold');
select throws_ok($$select api.admin_update_inactivity_policy(20,1)$$,'P0001','policy changed; reload','stale admin write rejected');
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='a7800000-0000-4000-8000-000000000001';
select throws_ok($$select api.accept_inactivity_policy(1)$$,'P0001','policy changed; review again','stale acceptance rejected');
select api.accept_inactivity_policy(2);
select is(api.my_inactivity_status()->>'accepted','true','current version can be explicitly accepted');
select ok((select last_seen_at > statement_timestamp()-interval '1 minute' from private.account_activity where user_id=auth.uid()),'acceptance restarts observation');
update private.account_activity set last_seen_at=statement_timestamp()-interval '31 days' where user_id=auth.uid();
select api.touch_account_activity();
set local request.jwt.claim.role='service_role';
select is(jsonb_array_length(api.inactive_account_candidates()),0,'returning to app prevents stale candidate deletion');
update private.account_activity set last_seen_at=statement_timestamp()-interval '31 days' where user_id='a7800000-0000-4000-8000-000000000001';
select lives_ok($$select api.prepare_inactive_account_erasure('a7800000-0000-4000-8000-000000000001')$$,'eligible account freezes for erasure');
select is((select reason from private.account_erasure_jobs where source_user_id='a7800000-0000-4000-8000-000000000001'),'inactivity','workflow reason recorded');
select lives_ok($$select api.prepare_inactive_account_erasure('a7800000-0000-4000-8000-000000000001')$$,'retry uses existing manifest');
select api.admin_update_inactivity_policy(60,2);
select is(jsonb_array_length(api.inactive_account_candidates()),1,'already started deletion remains retryable after settings change');
select api.mark_account_files_removed((select id from private.account_erasure_jobs where source_user_id='a7800000-0000-4000-8000-000000000001'));
delete from auth.users where id='a7800000-0000-4000-8000-000000000001';
select is((select count(*)::integer from private.account_activity where user_id='a7800000-0000-4000-8000-000000000001'),0,'activity and evidence deleted with account');
select ok(not exists(select 1 from private.account_erasure_jobs where source_user_id='a7800000-0000-4000-8000-000000000001'),'completed operations log no longer identifies user');
select ok(exists(select 1 from auth.users where id='a7800000-0000-4000-8000-000000000002'),'other account retained');
select * from finish();
rollback;
