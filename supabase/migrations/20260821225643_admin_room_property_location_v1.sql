begin;

create or replace function public.get_admin_room_property_location_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
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

  select jsonb_build_object(
    'property_id', p.id,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'house_number', p.house_number,
    'address', p.address,
    'ward', p.ward,
    'district', p.district,
    'city', p.city
  )
  into v_result
  from public.rooms r
  join public.properties p on p.id = r.property_id
  where r.id = p_room_id
    and coalesce(p.lifecycle_status, 'active') <> 'archived';

  if v_result is null then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_result;
end;
$function$;

create or replace function public.update_admin_room_property_location_v1(
  p_room_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_property_id uuid;
  v_changed boolean := false;
begin
  select au.level into v_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if v_uid is null or coalesce(v_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_room_id is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'COORDINATES_MUST_BE_PAIRED' using errcode = '22023';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'INVALID_LATITUDE' using errcode = '22023';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'INVALID_LONGITUDE' using errcode = '22023';
  end if;

  select r.property_id into v_property_id
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_property_id is null then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.properties p
  set latitude = p_latitude,
      longitude = p_longitude,
      updated_at = now()
  where p.id = v_property_id
    and coalesce(p.lifecycle_status, 'active') <> 'archived'
    and (
      p.latitude is distinct from p_latitude
      or p.longitude is distinct from p_longitude
    );
  v_changed := found;

  if not exists (select 1 from public.properties p where p.id = v_property_id) then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'property_id', v_property_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'changed', v_changed
  );
end;
$function$;

revoke all on function public.get_admin_room_property_location_v1(uuid)
from public, anon;
revoke all on function public.update_admin_room_property_location_v1(uuid, double precision, double precision)
from public, anon;

grant execute on function public.get_admin_room_property_location_v1(uuid)
to authenticated, service_role;
grant execute on function public.update_admin_room_property_location_v1(uuid, double precision, double precision)
to authenticated, service_role;

comment on function public.get_admin_room_property_location_v1(uuid) is
  'Returns the building location for an Admin L1/L2 room editor without exposing private building data.';
comment on function public.update_admin_room_property_location_v1(uuid, double precision, double precision) is
  'Lets Admin L1/L2 explicitly move or clear the building pin from the room editor.';

commit;
