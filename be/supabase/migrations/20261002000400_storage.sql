begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'couple-memories',
  'couple-memories',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function private.can_upload_memory_object(p_name text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_couple_id uuid;
  v_draw_id uuid;
  v_uploader_id uuid;
begin
  if p_user_id is null
     or array_length(v_parts, 1) <> 4
     or v_parts[1] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[2] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[3] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[4] !~ '^[0-9a-fA-F-]{36}\.(jpe?g|png|webp)$' then
    return false;
  end if;

  begin
    v_couple_id := v_parts[1]::uuid;
    v_draw_id := v_parts[2]::uuid;
    v_uploader_id := v_parts[3]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_uploader_id <> p_user_id then
    return false;
  end if;

  return exists (
    select 1
    from public.draws d
    join public.couples c on c.id = d.couple_id
    join public.couple_members cm
      on cm.couple_id = d.couple_id
     and cm.user_id = p_user_id
     and cm.left_at is null
    where d.id = v_draw_id
      and d.couple_id = v_couple_id
      and d.drawn_by = p_user_id
      and d.status = 'completed'
      and c.status = 'active'
  );
end;
$$;

create function private.can_read_memory_object(p_name text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_couple_id uuid;
  v_draw_id uuid;
begin
  if p_user_id is null
     or array_length(v_parts, 1) <> 4
     or v_parts[1] !~ '^[0-9a-fA-F-]{36}$'
     or v_parts[2] !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;

  begin
    v_couple_id := v_parts[1]::uuid;
    v_draw_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.draws d
    where d.id = v_draw_id
      and d.couple_id = v_couple_id
      and d.status = 'completed'
      and private.is_active_couple_member(v_couple_id, p_user_id)
  );
end;
$$;

drop policy if exists couple_memories_insert on storage.objects;
create policy couple_memories_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'couple-memories'
  and private.can_upload_memory_object(name, (select auth.uid()))
);

drop policy if exists couple_memories_select on storage.objects;
create policy couple_memories_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'couple-memories'
  and private.can_read_memory_object(name, (select auth.uid()))
);

revoke execute on function private.can_upload_memory_object(text, uuid) from public, anon;
revoke execute on function private.can_read_memory_object(text, uuid) from public, anon;
grant execute on function private.can_upload_memory_object(text, uuid) to authenticated;
grant execute on function private.can_read_memory_object(text, uuid) to authenticated;

commit;
