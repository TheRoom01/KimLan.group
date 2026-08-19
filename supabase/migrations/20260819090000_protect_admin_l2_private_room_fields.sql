begin;

-- Admin L2 may edit public room data, but private contact fields belong to the
-- account that created the room. Preserve them on every update to another
-- account's room, including updates performed through SECURITY DEFINER RPCs.
create or replace function public.protect_admin_l2_room_private_fields_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_level integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  select au.level into v_level
  from public.admin_users au
  where au.user_id = auth.uid()
  limit 1;

  if v_level = 2 and old.owner_id is distinct from auth.uid() then
    new.link_zalo := old.link_zalo;
    new.zalo_phone := old.zalo_phone;
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_admin_l2_room_private_fields_v1 on public.rooms;
create trigger protect_admin_l2_room_private_fields_v1
before update of link_zalo, zalo_phone on public.rooms
for each row execute function public.protect_admin_l2_room_private_fields_v1();

revoke all on function public.protect_admin_l2_room_private_fields_v1()
from public, anon, authenticated;

-- Safe entry point for the Admin UI. The legacy v2 function remains callable
-- by service_role for trusted backend work, but no longer by browser sessions.
create or replace function public.admin_upsert_room_v3(p_room_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_result jsonb;
begin
  select au.level into v_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if v_uid is null or coalesce(v_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_result := public.admin_upsert_room_v2(p_room_id, p_payload);

  if v_level = 2
    and nullif(v_result->>'owner_id', '')::uuid is distinct from v_uid then
    v_result := v_result
      || jsonb_build_object('link_zalo', null, 'zalo_phone', null);
  end if;

  return v_result;
end;
$function$;

revoke all on function public.admin_upsert_room_v2(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.admin_upsert_room_v2(uuid, jsonb)
to service_role;

revoke all on function public.admin_upsert_room_v3(uuid, jsonb)
from public, anon;
grant execute on function public.admin_upsert_room_v3(uuid, jsonb)
to authenticated, service_role;

-- Do not expose a building-level Zalo link to L2. For L2, the value is always
-- sourced from their own room and is null for rooms created by another user.
create or replace function public.get_room_shared_property_fields_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin_level integer;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select au.level into v_admin_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if coalesce(v_admin_level, 0) not in (1, 2)
    and not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'property_id', r.property_id,
    'link_zalo', case
      when v_admin_level = 1 and r.property_id is not null
        then p.default_room_data->>'link_zalo'
      when v_admin_level = 2 and r.owner_id = v_uid
        then r.link_zalo
      when v_admin_level = 2
        then null
      else r.link_zalo
    end,
    'google_maps_url', case
      when r.property_id is not null then p.google_maps_url
      else r.google_maps_url
    end,
    'chinh_sach', case
      when r.property_id is not null then p.default_room_data->>'chinh_sach'
      else r.chinh_sach
    end
  ) into v_result
  from public.rooms r
  left join public.properties p on p.id = r.property_id
  where r.id = p_room_id;

  if v_result is null then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.get_room_shared_property_fields_v1(uuid)
from public, anon;
grant execute on function public.get_room_shared_property_fields_v1(uuid)
to authenticated, service_role;

commit;
