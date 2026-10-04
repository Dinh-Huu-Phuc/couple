begin;

-- History inserts take FK KEY SHARE locks on profiles. NO KEY UPDATE still
-- serializes profile changes/connection approval, but permits those FK reads,
-- preventing an end-couple -> history vs prepare -> couple lock inversion.
do $$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('api.prepare_account_deletion(uuid)'::regprocedure);
  if strpos(v_definition, 'order by p.id for update;') = 0 then
    raise exception 'unexpected prepare_account_deletion definition';
  end if;
  execute replace(v_definition, 'order by p.id for update;', 'order by p.id for no key update;');
end;
$$;

create or replace function private.guard_deleting_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A volatile trigger query sees the marker after waiting for a row lock;
  -- do not reuse a STABLE function's earlier statement snapshot for writes.
  if auth.role() = 'authenticated' and (
    not exists (select 1 from auth.users where id = auth.uid())
    or exists (select 1 from private.deleted_data where kind = 'account' and source_user_id = auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'account deletion in progress';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Serialize object creation with deletion preparation. A client upload either
-- commits before the snapshot and is included, or is rejected after the marker.
-- This also blocks stale deleted-user JWTs from creating orphaned objects.
create function private.guard_deleting_storage_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and new.bucket_id = 'couple-memories' then
    perform 1 from public.profiles where id = auth.uid() for no key update;
    if not found or exists (
      select 1 from private.deleted_data where kind = 'account' and source_user_id = auth.uid()
    ) then
      raise exception using errcode = '42501', message = 'account deletion in progress';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_deleting_storage_actor before insert on storage.objects
for each row execute function private.guard_deleting_storage_actor();
revoke all on function private.guard_deleting_storage_actor() from public, anon, authenticated;

commit;
