begin;

create table private.account_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','abuse','other')),
  note text not null check (char_length(note) between 10 and 500),
  banned_at timestamptz not null default statement_timestamp()
);
alter table private.account_bans enable row level security;
revoke all on private.account_bans from public,anon,authenticated;

alter table private.account_erasure_jobs drop constraint account_erasure_jobs_reason_check;
alter table private.account_erasure_jobs add constraint account_erasure_jobs_reason_check
  check (reason in ('self','inactivity','moderation'));
create table private.moderation_erasure_notes (
  job_id uuid primary key references private.account_erasure_jobs(id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','abuse','other')),
  note text not null check(char_length(note) between 10 and 500)
);
alter table private.moderation_erasure_notes enable row level security;
revoke all on private.moderation_erasure_notes from public,anon,authenticated;
create function private.clear_completed_moderation_note()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' then
    delete from private.moderation_erasure_notes where job_id=new.id;
  end if;
  return new;
end; $$;
create trigger clear_completed_moderation_note after update of status on private.account_erasure_jobs
  for each row when(new.status='completed') execute function private.clear_completed_moderation_note();
revoke all on function private.clear_completed_moderation_note() from public,anon,authenticated;

-- Preserve the existing deletion/storage guards and add a separate ban gate.
create or replace function private.account_available(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join public.profiles p on p.id = u.id where u.id = p_user)
    and not exists (select 1 from private.deleted_data where kind = 'account' and source_user_id = p_user)
    and not exists (select 1 from private.account_erasure_jobs where source_user_id = p_user)
    and not exists (select 1 from private.account_bans where user_id = p_user);
$$;

create function private.guard_banned_actor()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.role() = 'authenticated' and exists (
    select 1 from private.account_bans where user_id=auth.uid()
  ) then raise exception using errcode='42501',message='account banned'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
do $$
declare v_table regclass;
begin
  for v_table in select unnest(array['public.profiles','public.couples','public.couple_members',
    'public.wishes','public.draws','public.memories','storage.objects']::regclass[]) loop
    execute format('create trigger guard_banned_actor before insert or update or delete on %s for each row execute function private.guard_banned_actor()',v_table);
  end loop;
end; $$;
revoke all on function private.guard_banned_actor() from public,anon,authenticated;

create function api.admin_set_account_ban(p_user_id uuid,p_reason text,p_note text,p_banned boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if p_banned then
    if p_reason not in ('spam','harassment','abuse','other') or char_length(trim(coalesce(p_note,''))) not between 10 and 500 then
      raise exception 'invalid moderation reason';
    end if;
    perform 1 from public.profiles where id=p_user_id for no key update;
    if not found or exists(select 1 from private.account_erasure_jobs where source_user_id=p_user_id) then
      raise exception 'account unavailable';
    end if;
    insert into private.account_bans(user_id,reason,note) values(p_user_id,p_reason,trim(p_note))
      on conflict(user_id) do update set reason=excluded.reason,note=excluded.note,banned_at=statement_timestamp();
  else
    delete from private.account_bans where user_id=p_user_id;
  end if;
end; $$;

create function api.prepare_moderated_account_erasure(p_user_id uuid,p_reason text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.account_erasure_jobs; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if p_reason not in ('spam','harassment','abuse','other') or char_length(trim(coalesce(p_note,''))) not between 10 and 500 then
    raise exception 'invalid moderation reason';
  end if;
  select * into v_job from private.account_erasure_jobs where source_user_id=p_user_id;
  if found then
    if v_job.reason <> 'moderation' then raise exception 'different deletion workflow'; end if;
    return jsonb_build_object('id',v_job.id,'files',v_job.files);
  end if;
  v_result := api.prepare_account_erasure(p_user_id);
  update private.account_erasure_jobs set reason='moderation' where source_user_id=p_user_id;
  insert into private.moderation_erasure_notes(job_id,reason,note)
    values((v_result->>'id')::uuid,p_reason,trim(p_note));
  return v_result;
end; $$;

create function api.admin_ban_statuses(p_user_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select case when auth.role() = 'service_role' then
    coalesce(jsonb_agg(jsonb_build_object('id',b.user_id,'reason',b.reason,'banned_at',b.banned_at)),'[]'::jsonb)
    else '[]'::jsonb end
  from private.account_bans b where b.user_id=any(p_user_ids);
$$;

-- A still-valid JWT must not grant read access after a ban.
do $$
declare v_table regclass;
begin
  for v_table in select unnest(array['public.profiles','public.couples','public.couple_members',
    'public.wishes','public.draws','public.memories']::regclass[]) loop
    execute format('create policy account_not_banned on %s as restrictive for select to authenticated using (private.account_available((select auth.uid())))',v_table);
  end loop;
end; $$;
create policy account_not_banned on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'couple-memories' or private.account_available((select auth.uid())));

revoke all on function api.admin_set_account_ban(uuid,text,text,boolean),
  api.prepare_moderated_account_erasure(uuid,text,text),api.admin_ban_statuses(uuid[]) from public,anon,authenticated;
grant execute on function api.admin_set_account_ban(uuid,text,text,boolean),
  api.prepare_moderated_account_erasure(uuid,text,text),api.admin_ban_statuses(uuid[]) to service_role;
commit;
