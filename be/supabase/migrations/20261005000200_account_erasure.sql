begin;

-- New requests use an operations ledger, never the legacy archive table.
-- Existing archive rows/bytes remain untouched and inaccessible to admin.
create table private.account_erasure_jobs (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid unique,
  files jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending','files_ready','completed')),
  last_error text check (last_error in ('storage','auth','database')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  audit_expires_at timestamptz,
  check (status <> 'completed' or (source_user_id is null and files = '[]'::jsonb and audit_expires_at is not null))
);
alter table private.account_erasure_jobs enable row level security;
revoke all on private.account_erasure_jobs from public,anon,authenticated;

create or replace function private.account_available(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.profiles p on p.id = u.id where u.id = p_user)
    and not exists (select 1 from private.deleted_data where kind = 'account' and source_user_id = p_user)
    and not exists (select 1 from private.account_erasure_jobs where source_user_id = p_user);
$$;
create or replace function private.guard_deleting_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    not exists (select 1 from auth.users where id = auth.uid())
    or exists (select 1 from private.deleted_data where kind = 'account' and source_user_id = auth.uid())
    or exists (select 1 from private.account_erasure_jobs where source_user_id = auth.uid())
  ) then raise exception using errcode = '42501', message = 'account deletion in progress'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create or replace function private.guard_deleting_storage_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and new.bucket_id = 'couple-memories' then
    perform 1 from public.profiles where id = auth.uid() for no key update;
    if not found or exists (select 1 from private.deleted_data where kind = 'account' and source_user_id = auth.uid())
      or exists (select 1 from private.account_erasure_jobs where source_user_id = auth.uid()) then
      raise exception using errcode = '42501', message = 'account deletion in progress';
    end if;
    -- A partner's upload may have started before erasure acquired both profile
    -- locks. Re-check the live draw/couple after waiting, using this volatile
    -- trigger query rather than the Storage policy's earlier STABLE snapshot.
    if not exists (select 1 from public.draws d join public.couples c on c.id = d.couple_id
      where d.id::text = split_part(new.name,'/',2) and c.id::text = split_part(new.name,'/',1)
        and d.drawn_by = auth.uid() and d.status = 'completed' and c.status = 'active') then
      raise exception using errcode = '42501', message = 'memory upload no longer allowed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.delete_connection_history_impl(p_history_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if not private.account_available(v_actor) then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','UNAUTHENTICATED')); end if;
  delete from private.connection_history where id = p_history_id and owner_id = v_actor returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',v_id));
end;
$$;

create function api.prepare_account_erasure(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job private.account_erasure_jobs; v_couples uuid[]; v_draws uuid[]; v_files jsonb;
begin
  perform 1 from public.profiles p where p.id = p_user_id or p.id in (
    select cm.user_id from public.couple_members cm where cm.couple_id in (
      select mine.couple_id from public.couple_members mine where mine.user_id = p_user_id))
    order by p.id for no key update;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'account not found'; end if;
  select * into v_job from private.account_erasure_jobs where source_user_id = p_user_id for update;
  if found then return jsonb_build_object('id',v_job.id,'files',v_job.files); end if;
  select coalesce(array_agg(cm.couple_id),'{}'::uuid[]) into v_couples from public.couple_members cm where cm.user_id = p_user_id;
  perform 1 from public.couples c where c.id = any(v_couples) order by c.id for update;
  select coalesce(array_agg(d.id),'{}'::uuid[]) into v_draws from public.draws d where
    d.drawn_by = p_user_id or d.wish_id in (select w.id from public.wishes w where w.author_id = p_user_id)
    or d.id in (select m.draw_id from public.memories m where m.created_by = p_user_id);
  select coalesce(jsonb_agg(jsonb_build_object('bucket',s.bucket_id,'name',s.name) order by s.name),'[]')
    into v_files from storage.objects s where s.bucket_id = 'couple-memories' and (
      s.owner_id = p_user_id::text or s.owner = p_user_id or s.name in (
        select m.photo_storage_key from public.memories m where m.draw_id = any(v_draws))
      or split_part(s.name,'/',2) = any(select d::text from unnest(v_draws) d));
  update public.draws set status = 'cancelled',resolved_at = statement_timestamp()
    where couple_id = any(v_couples) and status in ('opened','accepted','discuss');
  update public.couple_members set left_at = statement_timestamp() where couple_id = any(v_couples) and left_at is null;
  update public.couples set status = 'ended',ended_at = statement_timestamp() where id = any(v_couples) and status = 'active';
  update private.couple_invites set status = 'revoked' where created_by = p_user_id and status = 'active';
  update private.connection_requests set status = 'cancelled',resolved_at = statement_timestamp()
    where status = 'pending' and (requester_id = p_user_id or invite_id in (select id from private.couple_invites where created_by = p_user_id));
  insert into private.account_erasure_jobs(source_user_id,files) values (p_user_id,v_files) returning * into v_job;
  return jsonb_build_object('id',v_job.id,'files',v_job.files);
end;
$$;

create function api.mark_account_files_removed(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_job private.account_erasure_jobs; v_file jsonb;
begin
  select * into strict v_job from private.account_erasure_jobs where id = p_job_id for update;
  for v_file in select value from jsonb_array_elements(v_job.files) loop
    if exists (select 1 from storage.objects where bucket_id = v_file->>'bucket' and name = v_file->>'name') then
      raise exception 'storage deletion incomplete';
    end if;
  end loop;
  if exists (select 1 from storage.objects where bucket_id <> 'deleted-data'
      and (owner_id = v_job.source_user_id::text or owner = v_job.source_user_id)) then
    raise exception 'account still owns storage objects';
  end if;
  update private.account_erasure_jobs set status = 'files_ready',last_error = null where id = p_job_id and status <> 'completed';
end;
$$;
create function api.account_erasure_failed(p_job_id uuid,p_stage text)
returns void language sql security definer set search_path = '' as $$
  update private.account_erasure_jobs set last_error = p_stage where id = p_job_id and status <> 'completed'
    and p_stage in ('storage','auth','database');
$$;

-- Scope was explicitly chosen: remove shared draws/memories involving A, even
-- when created by B; preserve B's own wishes and unrelated draws/memories.
create or replace function private.archive_before_auth_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_job private.account_erasure_jobs; v_draws uuid[];
begin
  select * into v_job from private.account_erasure_jobs where source_user_id = old.id for update;
  if not found or v_job.status <> 'files_ready' then raise exception 'use the account erasure workflow first'; end if;
  select coalesce(array_agg(d.id),'{}'::uuid[]) into v_draws from public.draws d where
    d.drawn_by = old.id or d.wish_id in (select w.id from public.wishes w where w.author_id = old.id)
    or d.id in (select m.draw_id from public.memories m where m.created_by = old.id);
  delete from public.memories where draw_id = any(v_draws) or created_by = old.id;
  delete from public.draws where id = any(v_draws);
  delete from public.wishes where author_id = old.id;
  delete from private.connection_requests where requester_id = old.id or invite_id in (select id from private.couple_invites where created_by = old.id);
  delete from private.couple_invites where created_by = old.id;
  delete from public.couple_members where user_id = old.id;
  delete from private.connection_history where owner_id = old.id or person_id = old.id;
  update private.account_erasure_jobs set status = 'completed',completed_at = statement_timestamp(),
    source_user_id = null,files = '[]',last_error = null,audit_expires_at = statement_timestamp() + interval '30 days'
    where id = v_job.id;
  return old;
end;
$$;

-- Old deployments fail closed instead of producing further archive copies.
create or replace function api.prepare_account_deletion(p_user_id uuid)
returns jsonb language plpgsql set search_path = '' as $$ begin perform p_user_id; raise exception 'upgrade delete-account function'; end; $$;
create or replace function api.mark_deletion_files_ready(p_archive_id uuid)
returns void language plpgsql set search_path = '' as $$ begin perform p_archive_id; raise exception 'upgrade delete-account function'; end; $$;
revoke all on function api.prepare_account_deletion(uuid),api.mark_deletion_files_ready(uuid) from public,anon,authenticated,service_role;

create or replace function api.admin_deleted_data(p_before timestamptz default null,p_before_id uuid default null,p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]') into v_rows from (
    select * from (
      select id,status,created_at,completed_at,last_error,audit_expires_at,'erasure'::text as workflow
        from private.account_erasure_jobs
      union all
      select id,status,created_at,completed_at,null::text,null::timestamptz,'legacy'::text
        from private.deleted_data where kind = 'account'
    ) requests where (p_kind is null or p_kind = 'account')
      and (p_before is null or (created_at,id) < (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by created_at desc,id desc limit 20) x;
  return jsonb_build_object('ok',true,'data',v_rows);
end;
$$;
create or replace function api.admin_operations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','NOT_ALLOWED')); end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'accounts',(select count(*) from public.profiles p where private.account_available(p.id)),
    'activeCouples',(select count(*) from public.couples where status = 'active'),
    'pending',(select count(*) from private.account_erasure_jobs where status <> 'completed'),
    'failed',(select count(*) from private.account_erasure_jobs where last_error is not null),
    'legacyRequests',(select count(*) from private.deleted_data where kind = 'account'),
    'legacyObjects',(select count(*) from storage.objects where bucket_id = 'deleted-data')));
end;
$$;

create function api.purge_deletion_audit()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
  delete from private.account_erasure_jobs where status = 'completed' and audit_expires_at <= statement_timestamp();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function api.prepare_account_erasure(uuid),api.mark_account_files_removed(uuid),api.account_erasure_failed(uuid,text),
  api.purge_deletion_audit() from public,anon,authenticated;
grant execute on function api.prepare_account_erasure(uuid),api.mark_account_files_removed(uuid),api.account_erasure_failed(uuid,text),
  api.purge_deletion_audit() to service_role;
commit;
