begin;

-- Browser clients are untrusted. Keep per-actor abuse controls beside the
-- authorization boundary so direct DevTools/Postman calls cannot bypass them.
create function private.rate_limit_error(
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_allowed boolean;
  v_retry integer;
begin
  if v_actor is null then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'UNAUTHENTICATED')
    );
  end if;

  select allowed, retry_after_seconds
  into v_allowed, v_retry
  from private.consume_rate_limit(
    v_actor,
    p_action,
    p_max_requests,
    p_window_seconds
  );

  if v_allowed then
    return null;
  end if;

  return jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object(
      'code', 'RATE_LIMITED',
      'retryAfterSeconds', v_retry
    )
  );
end;
$$;

revoke all on function private.rate_limit_error(text, integer, integer)
from public, anon, authenticated;

create or replace function api.update_my_profile(
  p_display_name text,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('update_profile', 30, 3600);
  if v_error is not null then return v_error; end if;
  return private.update_my_profile_impl(p_display_name, p_timezone);
end;
$$;

create or replace function api.revoke_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('manage_connection', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.revoke_invite_impl(p_invite_id);
end;
$$;

create or replace function api.respond_connection(
  p_connection_request_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('manage_connection', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.respond_connection_impl(p_connection_request_id, p_response);
end;
$$;

create or replace function api.cancel_connection_request(
  p_connection_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('manage_connection', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.cancel_connection_request_impl(p_connection_request_id);
end;
$$;

create or replace function api.create_wish(
  p_title text,
  p_description text default '',
  p_category text default 'other',
  p_budget_vnd bigint default null,
  p_available_from timestamptz default null,
  p_expires_at timestamptz default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('create_wish', 30, 3600);
  if v_error is not null then return v_error; end if;
  return private.create_wish_impl(
    p_title,
    p_description,
    p_category,
    p_budget_vnd,
    p_available_from,
    p_expires_at,
    p_request_id
  );
end;
$$;

create or replace function api.update_wish(
  p_wish_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_category text,
  p_budget_vnd bigint,
  p_available_from timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('update_wish', 120, 3600);
  if v_error is not null then return v_error; end if;
  return private.update_wish_impl(
    p_wish_id,
    p_expected_version,
    p_title,
    p_description,
    p_category,
    p_budget_vnd,
    p_available_from,
    p_expires_at
  );
end;
$$;

create or replace function api.set_wish_status(
  p_wish_id uuid,
  p_expected_version integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('set_wish_status', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.set_wish_status_impl(
    p_wish_id,
    p_expected_version,
    p_status
  );
end;
$$;

create or replace function api.withdraw_wish(
  p_wish_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('withdraw_wish', 30, 3600);
  if v_error is not null then return v_error; end if;
  return private.withdraw_wish_impl(p_wish_id, p_expected_version);
end;
$$;

create or replace function api.respond_draw(
  p_draw_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('respond_draw', 60, 600);
  if v_error is not null then return v_error; end if;
  return private.respond_draw_impl(p_draw_id, p_response);
end;
$$;

create or replace function api.respond_draw(
  p_draw_id uuid,
  p_response text,
  p_message text,
  p_deferred_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('respond_draw', 60, 600);
  if v_error is not null then return v_error; end if;
  return private.respond_draw_impl(
    p_draw_id,
    p_response,
    p_message,
    p_deferred_until
  );
end;
$$;

create or replace function api.complete_draw(p_draw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('complete_draw', 30, 600);
  if v_error is not null then return v_error; end if;
  return private.complete_draw_impl(p_draw_id);
end;
$$;

create or replace function api.save_memory(
  p_draw_id uuid,
  p_message text default '',
  p_photo_storage_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('save_memory', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.save_memory_impl(
    p_draw_id,
    p_message,
    p_photo_storage_key
  );
end;
$$;

create or replace function api.end_couple(
  p_couple_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('end_couple', 5, 86400);
  if v_error is not null then return v_error; end if;
  return private.end_couple_impl(p_couple_id, p_request_id);
end;
$$;

create or replace function api.delete_connection_history(p_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_error jsonb;
begin
  v_error := private.rate_limit_error('delete_connection_history', 60, 3600);
  if v_error is not null then return v_error; end if;
  return private.delete_connection_history_impl(p_history_id);
end;
$$;

-- These implementations used to be called by invoker-rights SQL wrappers.
-- The guarded wrappers above now own the call, so browser roles must not be
-- able to invoke the unthrottled implementation functions directly.
revoke execute on function private.update_my_profile_impl(text, text),
  private.revoke_invite_impl(uuid),
  private.respond_connection_impl(uuid, text),
  private.cancel_connection_request_impl(uuid),
  private.create_wish_impl(text, text, text, bigint, timestamptz, timestamptz, uuid),
  private.update_wish_impl(uuid, integer, text, text, text, bigint, timestamptz, timestamptz),
  private.set_wish_status_impl(uuid, integer, text),
  private.withdraw_wish_impl(uuid, integer),
  private.respond_draw_impl(uuid, text),
  private.respond_draw_impl(uuid, text, text, timestamptz),
  private.complete_draw_impl(uuid),
  private.save_memory_impl(uuid, text, text),
  private.end_couple_impl(uuid, uuid),
  private.delete_connection_history_impl(uuid)
from public, anon, authenticated;

commit;
