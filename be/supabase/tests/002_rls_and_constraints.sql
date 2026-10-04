begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'c@example.test', '', now(), '{}', '{}', now(), now());

select is((select count(*)::integer from public.profiles where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
)), 3, 'auth trigger creates profiles');

select is((select count(*)::integer from public.profiles where display_name is null and id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
)), 3, 'new profiles require onboarding');

update public.profiles set display_name = case id
  when 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 'An'
  when 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then 'Bình'
  else 'Chi'
end where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
);

insert into public.couples (id, status)
values ('11111111-1111-4111-8111-111111111111', 'active');

insert into public.couple_members (couple_id, user_id)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select lives_ok('set constraints all immediate', 'two-member active couple satisfies deferred cardinality');
select is((select count(*)::integer from public.couple_members where left_at is null and couple_id = '11111111-1111-4111-8111-111111111111'), 2, 'active couple has two members');

insert into public.wishes (
  id, couple_id, author_id, title, description, category, status
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Một món quà nhỏ', '', 'gift', 'active'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select count(*)::integer from public.wishes), 1, 'wish author can read original wish');

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.wishes), 0, 'partner cannot read original wish');

set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is((select count(*)::integer from public.couples), 0, 'outsider cannot read couple');
select is((select count(*)::integer from public.couple_members), 0, 'outsider cannot read memberships');

set local role postgres;
select throws_like(
  $$insert into public.couple_members (couple_id, user_id) values
    ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '%duplicate key%',
  'duplicate membership is rejected'
);

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.draws), 0, 'no draw rows are exposed by fixtures');
select is((select count(*)::integer from public.memories), 0, 'no memory rows are exposed by fixtures');

select * from finish();
rollback;
