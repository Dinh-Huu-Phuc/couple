begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

select ok(to_regnamespace('private') is not null, 'private schema exists');
select ok(to_regnamespace('api') is not null, 'api schema exists');
select ok(to_regclass('public.profiles') is not null, 'profiles table exists');
select ok(to_regclass('public.couples') is not null, 'couples table exists');
select ok(to_regclass('public.couple_members') is not null, 'couple_members table exists');
select ok(to_regclass('public.wishes') is not null, 'wishes table exists');
select ok(to_regclass('public.draws') is not null, 'draws table exists');
select ok(to_regclass('public.memories') is not null, 'memories table exists');
select ok(to_regclass('private.couple_invites') is not null, 'private invites table exists');
select ok(to_regclass('private.connection_requests') is not null, 'private connection requests table exists');
select ok(to_regclass('private.rate_limits') is not null, 'private rate limits table exists');
select ok(to_regclass('private.idempotency_requests') is not null, 'private idempotency table exists');

select ok(to_regprocedure('api.get_my_context()') is not null, 'get_my_context RPC exists');
select ok(to_regprocedure('api.update_my_profile(text,text)') is not null, 'update_my_profile RPC exists');
select ok(to_regprocedure('api.create_invite(uuid)') is not null, 'create_invite RPC exists');
select ok(to_regprocedure('api.preview_invite(text)') is not null, 'preview_invite RPC exists');
select ok(to_regprocedure('api.request_connection(text,uuid)') is not null, 'request_connection RPC exists');
select ok(to_regprocedure('api.respond_connection(uuid,text)') is not null, 'respond_connection RPC exists');
select ok(to_regprocedure('api.create_wish(text,text,text,bigint,timestamp with time zone,timestamp with time zone,uuid)') is not null, 'create_wish RPC exists');
select ok(to_regprocedure('api.update_wish(uuid,integer,text,text,text,bigint,timestamp with time zone,timestamp with time zone)') is not null, 'update_wish RPC exists');
select ok(to_regprocedure('api.draw_wish(uuid,text,bigint)') is not null, 'draw_wish RPC exists');
select ok(to_regprocedure('api.respond_draw(uuid,text)') is not null, 'respond_draw RPC exists');
select ok(to_regprocedure('api.complete_draw(uuid)') is not null, 'complete_draw RPC exists');
select ok(to_regprocedure('api.save_memory(uuid,text,text)') is not null, 'save_memory RPC exists');
select ok(to_regprocedure('api.end_couple(uuid,uuid)') is not null, 'end_couple RPC exists');

select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'profiles has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.couples'::regclass), true, 'couples has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.couple_members'::regclass), true, 'couple_members has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.wishes'::regclass), true, 'wishes has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.draws'::regclass), true, 'draws has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.memories'::regclass), true, 'memories has RLS');

select is(has_table_privilege('authenticated', 'public.wishes', 'INSERT'), false, 'authenticated cannot insert wishes directly');
select is(has_table_privilege('authenticated', 'public.wishes', 'SELECT'), true, 'authenticated can select wishes through RLS');
select is(has_table_privilege('anon', 'public.profiles', 'SELECT'), false, 'anon cannot select profiles');
select is(has_function_privilege('authenticated', 'api.get_my_context()', 'EXECUTE'), true, 'authenticated can call allowed RPC');
select is(has_function_privilege('anon', 'api.get_my_context()', 'EXECUTE'), false, 'anon cannot call authenticated RPC');
select is(has_table_privilege('authenticated', 'private.couple_invites', 'SELECT'), false, 'authenticated cannot read private invites');
select is(has_schema_privilege('anon', 'private', 'USAGE'), false, 'anon cannot use private schema');
select ok(exists(select 1 from storage.buckets where id = 'couple-memories' and public = false), 'private memory bucket exists');
select is((select attnotnull from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'display_name'), false, 'display_name is nullable before onboarding');
select ok(to_regclass('public.couple_members_one_active_per_user_idx') is not null, 'one active couple per user index exists');
select ok(to_regclass('public.draws_one_open_per_wish_idx') is not null, 'one open draw per wish index exists');

select * from finish();
rollback;
