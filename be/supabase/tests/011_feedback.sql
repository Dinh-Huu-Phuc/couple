begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','ea000000-0000-4000-8000-000000000001','authenticated','authenticated','feedback-a@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','ea000000-0000-4000-8000-000000000002','authenticated','authenticated','feedback-b@example.test','',now(),'{}','{}',now(),now());

set local role authenticated;
set local request.jwt.claim.sub = 'ea000000-0000-4000-8000-000000000001';
select is(
  api.create_feedback('eb000000-0000-4000-8000-000000000001','bug','Không mở được thư','Màn hình báo lỗi khi bốc một mong muốn.','feedback-a@example.test') #>> '{data,status}',
  'new', 'authenticated user can create feedback'
);
select is(jsonb_array_length(api.list_my_feedback(20)->'data'), 1, 'user can list own feedback');
select is(
  api.create_feedback('eb000000-0000-4000-8000-000000000002','bug','Ngắn','quá ngắn','feedback-a@example.test') #>> '{error,code}',
  'VALIDATION_ERROR', 'server validates feedback fields'
);

set local request.jwt.claim.sub = 'ea000000-0000-4000-8000-000000000002';
select is(jsonb_array_length(api.list_my_feedback(20)->'data'), 0, 'another user cannot see feedback');
select is(has_function_privilege('anon','api.create_feedback(uuid,text,text,text,text)','EXECUTE'), false, 'anonymous cannot create feedback');
select is(has_function_privilege('authenticated','api.admin_feedback(text)','EXECUTE'), false, 'users cannot access admin feedback');

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select is(jsonb_array_length(api.admin_feedback(null)), 1, 'service role can list feedback');
select is(
  api.admin_update_feedback((api.admin_feedback(null)->0->>'id')::uuid, 'resolved', 'Đã kiểm tra và sửa lỗi.') ->> 'status',
  'resolved', 'service role can resolve feedback'
);

select * from finish();
rollback;
