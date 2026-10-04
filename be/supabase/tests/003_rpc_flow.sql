begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

create temporary table rpc_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'd@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'e@example.test', '', now(), '{}', '{}', now(), now());

update public.profiles
set display_name = case id
  when 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' then 'Dương'
  else 'Em'
end
where id in (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
insert into rpc_state (key, value)
values ('invite', api.create_invite('30000000-0000-4000-8000-000000000001'));

select is((select (value ->> 'ok')::boolean from rpc_state where key = 'invite'), true, 'A creates an invite');
select matches((select value #>> '{data,code}' from rpc_state where key = 'invite'), '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$', 'invite code uses safe alphabet');

set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
insert into rpc_state (key, value)
select 'request', api.request_connection(
  (select value #>> '{data,code}' from rpc_state where key = 'invite'),
  '30000000-0000-4000-8000-000000000002'
);

select is((select (value ->> 'ok')::boolean from rpc_state where key = 'request'), true, 'B requests connection');
select is((select value #>> '{data,status}' from rpc_state where key = 'request'), 'pending', 'connection request is pending');

set local request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
insert into rpc_state (key, value)
select 'accept', api.respond_connection(
  (select (value #>> '{data,connectionRequestId}')::uuid from rpc_state where key = 'request'),
  'accept'
);

select is((select value #>> '{data,status}' from rpc_state where key = 'accept'), 'accepted', 'A accepts connection');
select is((select count(*)::integer from public.couple_members where left_at is null and couple_id = (select (value #>> '{data,coupleId}')::uuid from rpc_state where key = 'accept')), 2, 'accepted couple has exactly two members');

set constraints all immediate;
set constraints all deferred;

insert into rpc_state (key, value)
values ('wish', api.create_wish(
  'Một bữa tối ấm áp',
  'Cuối tuần này',
  'date',
  500000,
  null,
  null,
  '30000000-0000-4000-8000-000000000003'
));

select is((select (value ->> 'ok')::boolean from rpc_state where key = 'wish'), true, 'A creates a secret wish');

set local request.jwt.claim.sub = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
insert into rpc_state (key, value)
values ('draw', api.draw_wish(
  '30000000-0000-4000-8000-000000000004',
  'date',
  500000
));

select is((select (value ->> 'ok')::boolean from rpc_state where key = 'draw'), true, 'B draws a matching wish');
select is((select value #>> '{data,snapshot,title}' from rpc_state where key = 'draw'), 'Một bữa tối ấm áp', 'draw returns an immutable snapshot');

insert into rpc_state (key, value)
select 'draw_accept', api.respond_draw(
  (select (value #>> '{data,id}')::uuid from rpc_state where key = 'draw'),
  'accepted'
);
select is((select value #>> '{data,status}' from rpc_state where key = 'draw_accept'), 'accepted', 'drawer accepts the wish');

insert into rpc_state (key, value)
select 'complete', api.complete_draw(
  (select (value #>> '{data,id}')::uuid from rpc_state where key = 'draw')
);
select is((select value #>> '{data,status}' from rpc_state where key = 'complete'), 'completed', 'accepted draw can be completed');
select is((select status from public.wishes where id = (select (value #>> '{data,id}')::uuid from rpc_state where key = 'wish')), 'fulfilled', 'completing a draw fulfills its wish');

insert into rpc_state (key, value)
select 'memory', api.save_memory(
  (select (value #>> '{data,id}')::uuid from rpc_state where key = 'draw'),
  'Một buổi tối rất vui',
  null
);
select is((select (value ->> 'ok')::boolean from rpc_state where key = 'memory'), true, 'drawer saves one memory');
select is((select count(*)::integer from public.memories where draw_id = (select (value #>> '{data,id}')::uuid from rpc_state where key = 'draw')), 1, 'completed draw has at most one memory');

insert into rpc_state (key, value)
select 'end', api.end_couple(
  (select (value #>> '{data,coupleId}')::uuid from rpc_state where key = 'accept'),
  '30000000-0000-4000-8000-000000000005'
);
select is((select value #>> '{data,status}' from rpc_state where key = 'end'), 'ended', 'B can end the couple');

set constraints all immediate;
set constraints all deferred;

select is((select count(*)::integer from public.couple_members where left_at is null and couple_id = (select (value #>> '{data,coupleId}')::uuid from rpc_state where key = 'accept')), 0, 'ending removes both active memberships');

insert into rpc_state (key, value)
select 'end_retry', api.end_couple(
  (select (value #>> '{data,coupleId}')::uuid from rpc_state where key = 'accept'),
  '30000000-0000-4000-8000-000000000005'
);
select is((select value #>> '{data,status}' from rpc_state where key = 'end_retry'), 'ended', 'end retry is idempotent after access is revoked');

set local role authenticated;
select is((select count(*)::integer from public.draws), 0, 'former member cannot read draw snapshots after end');
select is((select count(*)::integer from public.memories), 0, 'former member cannot read memories after end');
set local role postgres;

select * from finish();
rollback;
