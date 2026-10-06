begin;

create table private.inactivity_policy (
  singleton boolean primary key default true check(singleton),
  days integer not null default 45 check(days between 1 and 3650),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into private.inactivity_policy(singleton) values(true);
create table private.account_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  observed boolean not null default false,
  consent_version integer,
  consent_days integer,
  consented_at timestamptz
);
alter table private.inactivity_policy enable row level security;
alter table private.account_activity enable row level security;
revoke all on private.inactivity_policy,private.account_activity from public,anon,authenticated;
alter table private.account_erasure_jobs add column reason text not null default 'self'
  check(reason in ('self','inactivity'));

-- Signup evidence is copied once from the explicit checkbox. Later edits to
-- user_metadata cannot forge or alter the private evidence record.
create function private.record_signup_inactivity_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_policy private.inactivity_policy;
begin
  select * into v_policy from private.inactivity_policy where singleton for share;
  insert into private.account_activity(user_id,observed) values(new.id,true);
  if new.raw_user_meta_data->>'inactivity_consent' = 'true' then
    if new.raw_user_meta_data->>'inactivity_version' is distinct from v_policy.version::text
      or new.raw_user_meta_data->>'inactivity_days' is distinct from v_policy.days::text then
      raise exception 'inactivity policy changed; review it again';
    end if;
    update private.account_activity set consent_version=v_policy.version,
      consent_days=v_policy.days,consented_at=statement_timestamp() where user_id=new.id;
  end if;
  return new;
end; $$;
create trigger on_auth_user_inactivity after insert on auth.users
  for each row execute function private.record_signup_inactivity_consent();
-- Existing users are NOT opted in, and no historical last login is treated as
-- a measurement of app activity. Start observation at rollout.
insert into private.account_activity(user_id) select id from auth.users;

create function api.inactivity_policy()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('days',days,'version',version) from private.inactivity_policy where singleton;
$$;
create function api.my_inactivity_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('days',p.days,'version',p.version,
    'accepted',coalesce(a.consent_version=p.version,false))
  from private.inactivity_policy p left join private.account_activity a on a.user_id=auth.uid() where p.singleton;
$$;
create function api.touch_account_activity()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=auth.uid() for no key update;
  if private.account_available(auth.uid()) then
    update private.account_activity set last_seen_at=statement_timestamp(),observed=true
      where user_id=auth.uid() and (not observed or last_seen_at < statement_timestamp()-interval '5 minutes');
  end if;
end; $$;
create function api.accept_inactivity_policy(p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_policy private.inactivity_policy;
begin
  select * into v_policy from private.inactivity_policy where singleton for share;
  perform 1 from public.profiles where id=auth.uid() for no key update;
  if not private.account_available(auth.uid()) then raise exception 'account unavailable'; end if;
  if v_policy.version <> p_version then raise exception 'policy changed; review again'; end if;
  update private.account_activity set consent_version=v_policy.version,consent_days=v_policy.days,
    consented_at=statement_timestamp(),last_seen_at=statement_timestamp(),observed=true where user_id=auth.uid();
end; $$;
create function api.admin_update_inactivity_policy(p_days integer,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy private.inactivity_policy;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'invalid days'; end if;
  select * into strict v_policy from private.inactivity_policy where singleton for update;
  if p_version is distinct from v_policy.version then raise exception 'policy changed; reload'; end if;
  if p_days <> v_policy.days then
    update private.inactivity_policy set days=p_days,version=version+1,updated_at=statement_timestamp() where singleton;
  end if;
  return api.inactivity_policy();
end; $$;

create function api.admin_activity_accounts(p_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into v_rows from (
    select u.id,u.email,u.created_at,a.last_seen_at,a.observed as activity_observed,
      floor(extract(epoch from (statement_timestamp()-a.last_seen_at))/86400)::integer as inactive_days,
      coalesce(a.consent_version=p.version,false) as accepted,
      a.last_seen_at + make_interval(days=>p.days) as eligible_at,
      coalesce(a.consent_version=p.version and a.last_seen_at <= statement_timestamp()-make_interval(days=>p.days),false) as eligible,
      exists(select 1 from private.account_erasure_jobs j where j.source_user_id=u.id) as deletion_pending
    from auth.users u join private.account_activity a on a.user_id=u.id cross join private.inactivity_policy p
    where p.singleton and (p_after is null or u.id>p_after) order by u.id limit 50
  ) x;
  return v_rows;
end; $$;

-- The worker never gets emails or private content. Retry only jobs that this
-- inactivity workflow started; self-deletion jobs retain their own workflow.
create function api.inactive_account_candidates()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select coalesce(jsonb_agg(x.user_id),'[]') into v_rows from (
    select a.user_id from private.account_activity a cross join private.inactivity_policy p
    left join private.account_erasure_jobs j on j.source_user_id=a.user_id
    where p.singleton and ((j.reason='inactivity' and j.status<>'completed') or
      (j.id is null and a.consent_version=p.version and a.last_seen_at <= statement_timestamp()-make_interval(days=>p.days)))
    order by case when j.id is null then 1 else 0 end,a.last_seen_at,a.user_id limit 20
  ) x;
  return v_rows;
end; $$;
create function api.prepare_inactive_account_erasure(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy private.inactivity_policy; v_activity private.account_activity; v_job private.account_erasure_jobs; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not allowed'; end if;
  select * into v_policy from private.inactivity_policy where singleton for share;
  -- Same ordered participant locks as self-erasure: activity cannot race the
  -- final eligibility check, and partners deleting simultaneously cannot deadlock.
  perform 1 from public.profiles p where p.id=p_user_id or p.id in (
    select cm.user_id from public.couple_members cm where cm.couple_id in (
      select mine.couple_id from public.couple_members mine where mine.user_id=p_user_id))
    order by p.id for no key update;
  select * into v_job from private.account_erasure_jobs where source_user_id=p_user_id;
  if found then
    if v_job.reason<>'inactivity' then raise exception 'different deletion workflow'; end if;
    return jsonb_build_object('id',v_job.id,'files',v_job.files);
  end if;
  select * into v_activity from private.account_activity where user_id=p_user_id;
  if not found or v_activity.consent_version is distinct from v_policy.version
    or v_activity.last_seen_at > statement_timestamp()-make_interval(days=>v_policy.days) then
    raise exception 'account not eligible';
  end if;
  v_result := api.prepare_account_erasure(p_user_id);
  update private.account_erasure_jobs set reason='inactivity' where source_user_id=p_user_id;
  return v_result;
end; $$;

revoke all on function api.inactivity_policy(),api.my_inactivity_status(),api.touch_account_activity(),api.accept_inactivity_policy(integer),
  api.admin_update_inactivity_policy(integer,integer),api.admin_activity_accounts(uuid),api.inactive_account_candidates(),
  api.prepare_inactive_account_erasure(uuid) from public,anon,authenticated;
grant execute on function api.inactivity_policy() to anon,authenticated,service_role;
grant usage on schema api to anon;
grant execute on function api.my_inactivity_status(),api.touch_account_activity(),api.accept_inactivity_policy(integer) to authenticated;
grant execute on function api.admin_update_inactivity_policy(integer,integer),api.admin_activity_accounts(uuid),
  api.inactive_account_candidates(),api.prepare_inactive_account_erasure(uuid) to service_role;
commit;
