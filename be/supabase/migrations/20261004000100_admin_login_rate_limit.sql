begin;

-- Once the budget is exhausted, even a matching password must wait for expiry.
-- The row lock serializes concurrent attempts, so parallel requests cannot
-- skip the shared budget. This function is callable only by the trusted server.
create or replace function api.admin_login_attempt(p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempt private.admin_login_attempts;
begin
  select * into v_attempt from private.admin_login_attempts where singleton for update;
  if v_attempt.window_started_at >= clock_timestamp() - interval '15 minutes'
     and v_attempt.failures >= 5 then
    return false;
  end if;
  if p_success then
    update private.admin_login_attempts set failures=0, window_started_at=clock_timestamp() where singleton;
    return true;
  end if;
  if v_attempt.window_started_at < clock_timestamp() - interval '15 minutes' then
    update private.admin_login_attempts set failures=1, window_started_at=clock_timestamp() where singleton;
    return true;
  end if;
  update private.admin_login_attempts set failures=failures+1 where singleton;
  return true;
end;
$$;

revoke all on function api.admin_login_attempt(boolean) from public, anon, authenticated;
grant execute on function api.admin_login_attempt(boolean) to service_role;
commit;
