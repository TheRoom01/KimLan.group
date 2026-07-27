begin;

create or replace function public.create_owner_property_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_property_id uuid := gen_random_uuid();
  v_code text;
  v_name text;
  v_house_number text;
  v_address text;
  v_ward text;
  v_district text;
  v_city text;
  v_cover_image text;
  v_note text;
  v_latitude double precision;
  v_longitude double precision;
  v_property public.properties%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'payload must be a JSON object';
  end if;

  v_house_number := nullif(btrim(p_payload->>'house_number'), '');
  v_address := nullif(btrim(p_payload->>'address'), '');
  v_ward := nullif(btrim(p_payload->>'ward'), '');
  v_district := nullif(btrim(p_payload->>'district'), '');
  v_city := coalesce(
    nullif(btrim(p_payload->>'city'), ''),
    'Hồ Chí Minh'
  );
  v_name := nullif(btrim(p_payload->>'name'), '');
  v_cover_image := nullif(btrim(p_payload->>'cover_image'), '');
  v_note := nullif(btrim(p_payload->>'note'), '');

  if v_house_number is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'house_number is required';
  end if;

  if v_address is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'address is required';
  end if;

  if v_district is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'district is required';
  end if;

  if p_payload ? 'latitude'
    and nullif(btrim(p_payload->>'latitude'), '') is not null
  then
    begin
      v_latitude := (p_payload->>'latitude')::double precision;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
      then
        raise exception using
          errcode = '22023',
          message = 'INVALID_INPUT',
          detail = 'latitude must be a valid number';
    end;
  end if;

  if p_payload ? 'longitude'
    and nullif(btrim(p_payload->>'longitude'), '') is not null
  then
    begin
      v_longitude := (p_payload->>'longitude')::double precision;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
      then
        raise exception using
          errcode = '22023',
          message = 'INVALID_INPUT',
          detail = 'longitude must be a valid number';
    end;
  end if;

  if v_latitude is not null
    and (v_latitude < -90 or v_latitude > 90)
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'latitude must be between -90 and 90';
  end if;

  if v_longitude is not null
    and (v_longitude < -180 or v_longitude > 180)
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'longitude must be between -180 and 180';
  end if;

  v_code := coalesce(
    nullif(btrim(p_payload->>'code'), ''),
    'KL-' || upper(substr(replace(v_property_id::text, '-', ''), 1, 8))
  );

  insert into public.properties (
    id,
    code,
    name,
    property_key,
    house_number,
    address,
    district,
    ward,
    city,
    latitude,
    longitude,
    cover_image,
    note,
    approval_status,
    lifecycle_status,
    created_by,
    submitted_at,
    created_at,
    updated_at
  )
  values (
    v_property_id,
    v_code,
    v_name,
    'owner-' || replace(v_property_id::text, '-', ''),
    v_house_number,
    v_address,
    v_district,
    v_ward,
    v_city,
    v_latitude,
    v_longitude,
    v_cover_image,
    v_note,
    'pending',
    'active',
    v_uid,
    now(),
    now(),
    now()
  )
  returning *
  into v_property;

  insert into public.property_members (
    property_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_property_id,
    v_uid,
    'owner',
    'active',
    v_uid,
    now(),
    now()
  )
  on conflict (property_id, user_id)
  do update set
    role = 'owner',
    status = 'active',
    updated_at = now();

  insert into public.property_owners (
    property_id,
    user_id,
    created_at
  )
  values (
    v_property_id,
    v_uid,
    now()
  )
  on conflict (property_id, user_id)
  do nothing;

  return jsonb_build_object(
    'ok', true,
    'property', to_jsonb(v_property)
  );
end;
$function$;

revoke all
on function public.create_owner_property_v1(jsonb)
from public, anon;

grant execute
on function public.create_owner_property_v1(jsonb)
to authenticated, service_role;


create or replace function public.create_owner_room_v1(
  p_property_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid := gen_random_uuid();
  v_property public.properties%rowtype;
  v_room public.rooms%rowtype;
  v_room_code text;
  v_room_type text;
  v_description text;
  v_chinh_sach text;
  v_link_zalo text;
  v_zalo_phone text;
  v_price bigint;
  v_details jsonb;
  v_details_saved boolean := false;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id is required';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'payload must be a JSON object';
  end if;

  select p.*
  into v_property
  from public.properties p
  where p.id = p_property_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property not found';
  end if;

  if not public.can_manage_property(p_property_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  if v_property.lifecycle_status = 'archived' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Cannot create a room in an archived property';
  end if;

  v_room_code := nullif(btrim(p_payload->>'room_code'), '');
  v_room_type := nullif(btrim(p_payload->>'room_type'), '');
  v_description := nullif(btrim(p_payload->>'description'), '');
  v_chinh_sach := nullif(btrim(p_payload->>'chinh_sach'), '');
  v_link_zalo := nullif(btrim(p_payload->>'link_zalo'), '');
  v_zalo_phone := nullif(btrim(p_payload->>'zalo_phone'), '');

  if v_room_code is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'room_code is required';
  end if;

  if exists (
    select 1
    from public.rooms r
    where r.property_id = p_property_id
      and lower(btrim(coalesce(r.room_code, ''))) = lower(v_room_code)
      and r.lifecycle_status = 'active'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'An active room with this room_code already exists in the property';
  end if;

  if p_payload ? 'price'
    and nullif(btrim(p_payload->>'price'), '') is not null
  then
    begin
      v_price := (p_payload->>'price')::bigint;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range
      then
        raise exception using
          errcode = '22023',
          message = 'INVALID_INPUT',
          detail = 'price must be a valid integer';
    end;

    if v_price < 0 then
      raise exception using
        errcode = '22023',
        message = 'INVALID_INPUT',
        detail = 'price must be greater than or equal to zero';
    end if;
  end if;

  v_details := case
    when jsonb_typeof(p_payload->'room_details') = 'object'
      then p_payload->'room_details'
    when jsonb_typeof(p_payload->'details') = 'object'
      then p_payload->'details'
    else null
  end;

  insert into public.rooms (
    id,
    room_type,
    room_code,
    address,
    house_number,
    ward,
    district,
    price,
    status,
    description,
    chinh_sach,
    link_zalo,
    zalo_phone,
    owner_id,
    property_id,
    lifecycle_status,
    publish_status,
    is_hidden,
    created_at,
    updated_at
  )
  values (
    v_room_id,
    v_room_type,
    v_room_code,
    v_property.address,
    v_property.house_number,
    v_property.ward,
    v_property.district,
    v_price,
    'Đang trống',
    v_description,
    v_chinh_sach,
    v_link_zalo,
    v_zalo_phone,
    v_uid,
    p_property_id,
    'active',
    'draft',
    true,
    now(),
    now()
  )
  returning *
  into v_room;

  if v_details is not null then
    perform public.save_room_details_v1(
      v_room_id,
      v_details
    );

    v_details_saved := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'room', to_jsonb(v_room),
    'details_saved', v_details_saved
  );
end;
$function$;

revoke all
on function public.create_owner_room_v1(uuid, jsonb)
from public, anon;

grant execute
on function public.create_owner_room_v1(uuid, jsonb)
to authenticated, service_role;

commit;
