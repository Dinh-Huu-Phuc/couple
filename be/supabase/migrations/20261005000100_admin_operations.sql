begin;

-- Operations-only admin. This migration does not delete existing user data or
-- archive bytes; their erasure requires the separately reviewed cleanup plan.
create or replace function api.admin_deleted_detail(p_archive_id uuid)
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED'));
$$;
revoke all on function api.admin_deleted_detail(uuid) from public,anon,authenticated,service_role;

create or replace function api.admin_deleted_data(p_before timestamptz default null,p_before_id uuid default null,p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') into v_rows from (
    select id,status,created_at,completed_at
    from private.deleted_data where kind = 'account' and (p_kind is null or p_kind = 'account')
      and (p_before is null or (created_at,id) < (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by created_at desc,id desc limit 20) x;
  return jsonb_build_object('ok',true,'data',v_rows);
end;
$$;

create function api.admin_operations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'accounts',(select count(*) from public.profiles p where private.account_available(p.id)),
    'activeCouples',(select count(*) from public.couples where status = 'active'),
    'pending',(select count(*) from private.deleted_data where kind = 'account' and status <> 'completed'),
    'legacyObjects',(select count(*) from storage.objects where bucket_id = 'deleted-data')));
end;
$$;
revoke all on function api.admin_operations() from public,anon,authenticated;
grant execute on function api.admin_operations() to service_role;
commit;
