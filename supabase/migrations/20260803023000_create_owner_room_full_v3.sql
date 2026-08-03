begin;

create or replace function public.create_owner_room_full_v3(p_property_id uuid, p_payload jsonb)
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
  v_price bigint;
  v_details jsonb;
  v_details_saved boolean := false;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_property_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;

  select p.* into v_property
  from public.properties p
  where p.id = p_property_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;
  if not public.can_manage_property(p_property_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_property.lifecycle_status = 'archived' then
    raise exception using errcode = 'P0001', message = 'CONFLICT', detail = 'Cannot create a room in an archived property';
  end if;

  v_room_code := nullif(btrim(p_payload->>'room_code'), '');
  if v_room_code is null then
    raise exception using errcode = '22023', message = 'INVALID_INPUT', detail = 'room_code is required';
  end if;
  if exists (
    select 1 from public.rooms r
    where r.property_id = p_property_id
      and r.lifecycle_status = 'active'
      and lower(btrim(coalesce(r.room_code, ''))) = lower(v_room_code)
  ) then
    raise exception using errcode = 'P0001', message = 'CONFLICT', detail = 'An active room with this room_code already exists in the property';
  end if;

  if nullif(btrim(p_payload->>'price'), '') is not null then
    begin
      v_price := (p_payload->>'price')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'INVALID_INPUT', detail = 'price must be a valid integer';
    end;
    if v_price < 0 then
      raise exception using errcode = '22023', message = 'INVALID_INPUT', detail = 'price must be non-negative';
    end if;
  end if;

  v_details := case
    when jsonb_typeof(p_payload->'room_details') = 'object' then p_payload->'room_details'
    when jsonb_typeof(p_payload->'details') = 'object' then p_payload->'details'
    else null
  end;

  insert into public.rooms (
    id, room_type, room_code, address, house_number, ward, district,
    price, status, description, chinh_sach, link_zalo, zalo_phone,
    google_maps_url, owner_id, property_id, lifecycle_status,
    publish_status, is_hidden, created_at, updated_at
  ) values (
    v_room_id,
    nullif(btrim(p_payload->>'room_type'), ''),
    v_room_code,
    coalesce(nullif(btrim(p_payload->>'address'), ''), v_property.address),
    coalesce(nullif(btrim(p_payload->>'house_number'), ''), v_property.house_number),
    coalesce(nullif(btrim(p_payload->>'ward'), ''), v_property.ward),
    coalesce(nullif(btrim(p_payload->>'district'), ''), v_property.district),
    v_price,
    coalesce(nullif(btrim(p_payload->>'status'), ''), 'Đang trống'),
    nullif(btrim(p_payload->>'description'), ''),
    nullif(btrim(p_payload->>'chinh_sach'), ''),
    nullif(btrim(p_payload->>'link_zalo'), ''),
    nullif(btrim(p_payload->>'zalo_phone'), ''),
    coalesce(nullif(btrim(p_payload->>'google_maps_url'), ''), v_property.google_maps_url),
    v_uid, p_property_id, 'active', 'draft', true, now(), now()
  ) returning * into v_room;

  if v_details is not null then
    perform public.save_room_details_v1(v_room_id, v_details);
    v_details_saved := true;
  end if;

  return jsonb_build_object(
    'ok', true, 'mode', 'created', 'room_id', v_room_id,
    'room', to_jsonb(v_room), 'details_saved', v_details_saved
  );
end;
$function$;

revoke all on function public.create_owner_room_full_v3(uuid, jsonb) from public, anon;
grant execute on function public.create_owner_room_full_v3(uuid, jsonb) to authenticated, service_role;

commit;
