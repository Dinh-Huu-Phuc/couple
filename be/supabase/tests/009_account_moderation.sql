begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is(has_table_privilege('authenticated','private.account_bans','SELECT'),false,'users cannot enumerate bans');
select is(has_function_privilege('authenticated','api.admin_set_account_ban(uuid,text,text,boolean)','EXECUTE'),false,'users cannot moderate');
select is(has_function_privilege('authenticated','api.prepare_moderated_account_erasure(uuid,text,text)','EXECUTE'),false,'users cannot erase others');
insert into auth.users(id,email) values ('b7800000-0000-4000-8000-000000000001','moderated@example.test');
set local request.jwt.claim.role='service_role';
select throws_ok($$select api.admin_set_account_ban('b7800000-0000-4000-8000-000000000001','spam','short',true)$$,
  'P0001','invalid moderation reason','brief unsupported accusation rejected');
select api.admin_set_account_ban('b7800000-0000-4000-8000-000000000001','spam','Repeated unsolicited messages',true);
select is(private.account_available('b7800000-0000-4000-8000-000000000001'),false,'banned user unavailable to application');
select is(jsonb_array_length(api.admin_ban_statuses(array['b7800000-0000-4000-8000-000000000001']::uuid[])),1,'admin can see ban status');
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='b7800000-0000-4000-8000-000000000001';
select throws_ok($$update public.profiles set display_name='blocked' where id=auth.uid()$$,
  '42501','account banned','existing session cannot write');
set local request.jwt.claim.role='service_role';
select api.admin_set_account_ban('b7800000-0000-4000-8000-000000000001','other','unban',false);
select is(private.account_available('b7800000-0000-4000-8000-000000000001'),true,'unban restores availability');
select lives_ok($$select api.prepare_moderated_account_erasure('b7800000-0000-4000-8000-000000000001','spam','Repeated unsolicited messages')$$,
  'moderation may erase before inactivity threshold');
select is((select reason from private.account_erasure_jobs where source_user_id='b7800000-0000-4000-8000-000000000001'),'moderation','erasure is labelled moderation');
select is((select count(*)::integer from private.moderation_erasure_notes),1,'reason retained only while deletion is pending');
select api.mark_account_files_removed((select id from private.account_erasure_jobs where source_user_id='b7800000-0000-4000-8000-000000000001'));
delete from auth.users where id='b7800000-0000-4000-8000-000000000001';
select is((select count(*)::integer from private.moderation_erasure_notes),0,'reason note cleared with completed deletion');
select * from finish();
rollback;
