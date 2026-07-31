begin;

create or replace function public.admin_upsert_room_v2(p_room_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_id uuid := coalesce(p_room_id, gen_random_uuid());
  v_existing public.rooms%rowtype;
  v_room_exists boolean := false;
  v_row public.rooms%rowtype;
  v_property_id uuid;
  v_new_property_id uuid;
  v_resolution jsonb;
  v_candidate_count integer;
  v_address_key text;
  v_house_number text := nullif(btrim(p_payload->>'house_number'), '');
  v_address text := nullif(btrim(p_payload->>'address'), '');
  v_ward text := nullif(btrim(p_payload->>'ward'), '');
  v_district text := nullif(btrim(p_payload->>'district'), '');
  v_city text := coalesce(nullif(btrim(p_payload->>'city'), ''), 'Hồ Chí Minh');
begin
  select au.level into v_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if v_uid is null or coalesce(v_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing
  from public.rooms
  where id = v_id
  for update;

  v_room_exists := found;
  v_property_id := v_existing.property_id;

  if v_property_id is null and nullif(p_payload->>'property_id', '') is not null then
    v_property_id := (p_payload->>'property_id')::uuid;
  end if;

  if v_property_id is null then
    if v_house_number is null or v_address is null or v_district is null then
      raise exception using
        errcode = '22023',
        message = 'INVALID_ADDRESS',
        detail = 'house_number, address and district are required to resolve a property';
    end if;

    v_address_key := public.property_address_key_v2(
      v_house_number,
      v_address,
      v_district
    );

    -- Serialize creation by normalized address so concurrent saves cannot
    -- create two unclaimed property containers for the same building.
    perform pg_advisory_xact_lock(hashtextextended(v_address_key, 0));

    v_resolution := public.admin_resolve_property_for_room_v2(p_payload);
    v_candidate_count := jsonb_array_length(
      coalesce(v_resolution->'candidates', '[]'::jsonb)
    );

    if v_candidate_count > 1 then
      raise exception using
        errcode = 'P0001',
        message = 'PROPERTY_MATCH_REQUIRED',
        detail = (v_resolution->'candidates')::text;
    elsif v_candidate_count = 1 then
      v_property_id := (v_resolution->'candidates'->0->>'id')::uuid;
    else
      v_new_property_id := gen_random_uuid();

      insert into public.properties (
        id,
        code,
        name,
        property_key,
        normalized_property_key,
        house_number,
        address,
        ward,
        district,
        city,
        note,
        approval_status,
        lifecycle_status,
        created_by,
        submitted_at,
        reviewed_by,
        reviewed_at,
        approval_note,
        created_at,
        updated_at
      ) values (
        v_new_property_id,
        'KL-' || upper(substr(replace(v_new_property_id::text, '-', ''), 1, 8)),
        concat('Tòa nhà ', v_house_number, ' ', v_address),
        'admin-unclaimed-' || replace(v_new_property_id::text, '-', ''),
        v_address_key,
        v_house_number,
        v_address,
        v_ward,
        v_district,
        v_city,
        'Tòa nhà được hệ thống tạo từ phòng Admin, đang chờ chủ nhà nhận quyền.',
        'approved',
        'active',
        v_uid,
        now(),
        v_uid,
        now(),
        'Tự động duyệt khi Admin tạo phòng mới chưa khớp tòa nhà.',
        now(),
        now()
      )
      returning id into v_property_id;

      -- Intentionally do not insert property_members/property_owners here.
      -- No active owner relationship means this property remains unclaimed.
    end if;
  end if;

  if not exists (
    select 1
    from public.properties p
    where p.id = v_property_id
      and coalesce(p.lifecycle_status, 'active') <> 'archived'
  ) then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_room_exists then
    update public.rooms r set
      room_code = nullif(p_payload->>'room_code', ''),
      room_type = nullif(p_payload->>'room_type', ''),
      house_number = v_house_number,
      address = v_address,
      ward = v_ward,
      district = v_district,
      price = case
        when p_payload ? 'price' then nullif(p_payload->>'price', '')::bigint
        else r.price
      end,
      status = nullif(p_payload->>'status', ''),
      description = nullif(p_payload->>'description', ''),
      link_zalo = nullif(p_payload->>'link_zalo', ''),
      google_maps_url = nullif(p_payload->>'google_maps_url', ''),
      zalo_phone = nullif(p_payload->>'zalo_phone', ''),
      chinh_sach = nullif(p_payload->>'chinh_sach', ''),
      property_id = coalesce(r.property_id, v_property_id),
      updated_at = now()
    where r.id = v_id
    returning * into v_row;
  else
    insert into public.rooms (
      id, room_code, room_type, house_number, address, ward, district,
      price, status, description, link_zalo, google_maps_url, zalo_phone,
      chinh_sach, owner_id, property_id, publish_status, created_at, updated_at
    ) values (
      v_id,
      nullif(p_payload->>'room_code', ''),
      nullif(p_payload->>'room_type', ''),
      v_house_number,
      v_address,
      v_ward,
      v_district,
      nullif(p_payload->>'price', '')::bigint,
      nullif(p_payload->>'status', ''),
      nullif(p_payload->>'description', ''),
      nullif(p_payload->>'link_zalo', ''),
      nullif(p_payload->>'google_maps_url', ''),
      nullif(p_payload->>'zalo_phone', ''),
      nullif(p_payload->>'chinh_sach', ''),
      coalesce(nullif(p_payload->>'owner_id', '')::uuid, v_uid),
      v_property_id,
      'published',
      now(),
      now()
    )
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.admin_upsert_room_v2(uuid, jsonb) from public, anon;
grant execute on function public.admin_upsert_room_v2(uuid, jsonb) to authenticated, service_role;

commit;
