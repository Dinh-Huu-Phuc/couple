begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f1200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'f12-alice@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'f12-bob@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1200000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'f12-carol@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1200000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'f12-dave@example.test', '', now(), '{}', '{}', now(), now());

update public.profiles
set display_name = case id
  when 'f1200000-0000-4000-8000-000000000001' then 'Alice'
  when 'f1200000-0000-4000-8000-000000000002' then 'Bob'
  when 'f1200000-0000-4000-8000-000000000003' then 'Carol'
  else 'Dave'
end
where id in (
  'f1200000-0000-4000-8000-000000000001',
  'f1200000-0000-4000-8000-000000000002',
  'f1200000-0000-4000-8000-000000000003',
  'f1200000-0000-4000-8000-000000000004'
);

insert into public.couples (id, status) values
  ('f1210000-0000-4000-8000-000000000001', 'active'),
  ('f1210000-0000-4000-8000-000000000002', 'active');

insert into public.couple_members (couple_id, user_id) values
  ('f1210000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001'),
  ('f1210000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000002'),
  ('f1210000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000003'),
  ('f1210000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000004');

set constraints all immediate;

insert into public.wishes (
  id, couple_id, author_id, title, description, category, status
) values
  ('f1220000-0000-4000-8000-000000000001', 'f1210000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'Couple A wish', '', 'care', 'fulfilled'),
  ('f1220000-0000-4000-8000-000000000002', 'f1210000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000003', 'Couple B wish', '', 'care', 'fulfilled');

insert into public.draws (
  id, couple_id, wish_id, drawn_by, status, request_id, snapshot,
  accepted_at, completed_at, resolved_at
) values
  ('f1230000-0000-4000-8000-000000000001', 'f1210000-0000-4000-8000-000000000001', 'f1220000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000002', 'completed', 'f1240000-0000-4000-8000-000000000001', '{}', now(), now(), now()),
  ('f1230000-0000-4000-8000-000000000002', 'f1210000-0000-4000-8000-000000000002', 'f1220000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000004', 'completed', 'f1240000-0000-4000-8000-000000000002', '{}', now(), now(), now());

insert into public.memories (id, draw_id, created_by, message, photo_storage_key) values
  ('f1250000-0000-4000-8000-000000000001', 'f1230000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000002', 'Couple A memory', 'f1210000-0000-4000-8000-000000000001/f1230000-0000-4000-8000-000000000001/f1200000-0000-4000-8000-000000000002/f1260000-0000-4000-8000-000000000001.jpg'),
  ('f1250000-0000-4000-8000-000000000002', 'f1230000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000004', 'Couple B memory', 'f1210000-0000-4000-8000-000000000002/f1230000-0000-4000-8000-000000000002/f1200000-0000-4000-8000-000000000004/f1260000-0000-4000-8000-000000000002.jpg');

insert into storage.objects (bucket_id, name, owner_id) values
  ('couple-memories', 'f1210000-0000-4000-8000-000000000001/f1230000-0000-4000-8000-000000000001/f1200000-0000-4000-8000-000000000002/f1260000-0000-4000-8000-000000000001.jpg', 'f1200000-0000-4000-8000-000000000002'),
  ('couple-memories', 'f1210000-0000-4000-8000-000000000002/f1230000-0000-4000-8000-000000000002/f1200000-0000-4000-8000-000000000004/f1260000-0000-4000-8000-000000000002.jpg', 'f1200000-0000-4000-8000-000000000004');

select is(
  has_function_privilege('authenticated', 'private.update_wish_impl(uuid,integer,text,text,text,bigint,timestamptz,timestamptz)', 'EXECUTE'),
  false,
  'browser role cannot bypass the guarded wish wrapper'
);
select is(
  has_function_privilege('authenticated', 'private.complete_draw_impl(uuid)', 'EXECUTE'),
  false,
  'browser role cannot bypass the guarded draw wrapper'
);
select is(
  has_function_privilege('authenticated', 'private.rate_limit_error(text,integer,integer)', 'EXECUTE'),
  false,
  'browser role cannot call the rate-limit helper'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'f1200000-0000-4000-8000-000000000001';

select is((select count(*)::integer from public.profiles), 1, 'DevTools queries expose only the current profile');
select is((select count(*)::integer from public.couples), 1, 'DevTools queries expose only the current couple');
select is((select count(*)::integer from public.couple_members), 2, 'DevTools queries expose only the current couple membership');
select is((select count(*)::integer from public.wishes), 1, 'DevTools queries do not expose another couple wishes');
select is((select count(*)::integer from public.draws), 1, 'DevTools queries do not expose another couple draws');
select is((select count(*)::integer from public.memories), 1, 'DevTools queries do not expose another couple memories');
select is((select count(*)::integer from storage.objects where bucket_id = 'couple-memories'), 1, 'DevTools queries do not expose another couple files');

select is(
  api.update_wish(
    'f1220000-0000-4000-8000-000000000002', 1, 'Stolen wish', '', 'other', null, null, null
  )#>>'{error,code}',
  'NOT_ALLOWED',
  'guessed wish ID cannot modify another couple data'
);
select is(
  api.complete_draw('f1230000-0000-4000-8000-000000000002')#>>'{error,code}',
  'NOT_ALLOWED',
  'guessed draw ID cannot modify another couple data'
);

select is(
  (
    select count(*)
    from (
      select api.update_my_profile('Alice', 'Asia/Ho_Chi_Minh') as result
      from generate_series(1, 30)
    ) calls
    where calls.result#>>'{ok}' = 'true'
  ),
  30::bigint,
  'normal profile updates remain available within the limit'
);
select is(
  api.update_my_profile('Alice', 'Asia/Ho_Chi_Minh')#>>'{error,code}',
  'RATE_LIMITED',
  'direct repeated RPC calls are throttled at the database boundary'
);
select ok(
  (api.update_my_profile('Alice', 'Asia/Ho_Chi_Minh')#>>'{error,retryAfterSeconds}')::integer > 0,
  'rate-limit response tells the client when it can retry'
);

select * from finish();
rollback;
