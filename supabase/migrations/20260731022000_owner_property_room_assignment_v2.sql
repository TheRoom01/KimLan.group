begin;

create or replace function public.property_address_key_v2(
  p_house_number text,
  p_address text,
  p_district text
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $function$
  select concat_ws(
    '|',
    public.admin_normalize_property_text_v1(p_house_number),
    public.admin_normalize_property_text_v1(p_address),
    public.admin_normalize_property_text_v1(p_district)
  );
$function$;

create or replace function public.sync_normalized_property_key_v2()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.normalized_property_key := public.property_address_key_v2(
    new.house_number,
    new.address,
    new.district
  );
  return new;
end;
$function$;

drop trigger if exists rooms_normalized_property_key_v2 on public.rooms;
create trigger rooms_normalized_property_key_v2
before insert or update of house_number, address, district
on public.rooms
for each row execute function public.sync_normalized_property_key_v2();

drop trigger if exists properties_normalized_property_key_v2 on public.properties;
create trigger properties_normalized_property_key_v2
before insert or update of house_number, address, district
on public.properties
for each row execute function public.sync_normalized_property_key_v2();

update public.rooms
set normalized_property_key = public.property_address_key_v2(house_number, address, district)
where normalized_property_key is distinct from public.property_address_key_v2(house_number, address, district);

update public.properties
set normalized_property_key = public.property_address_key_v2(house_number, address, district)
where normalized_property_key is distinct from public.property_address_key_v2(house_number, address, district);

create index if not exists rooms_normalized_property_key_idx
  on public.rooms(normalized_property_key);
create index if not exists properties_normalized_property_key_idx
  on public.properties(normalized_property_key);

create or replace function public.admin_resolve_property_for_room_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_key text;
  v_candidates jsonb;
  v_count integer;
begin
  select au.level into v_level from public.admin_users au where au.user_id = v_uid limit 1;
  if v_uid is null or coalesce(v_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_key := public.property_address_key_v2(
    p_payload->>'house_number',
    p_payload->>'address',
    p_payload->>'district'
  );

  if split_part(v_key, '|', 1) = '' or split_part(v_key, '|', 2) = '' or split_part(v_key, '|', 3) = '' then
    return jsonb_build_object('ok', true, 'match_status', 'insufficient_address', 'property_id', null, 'candidates', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name,
    'house_number', p.house_number, 'address', p.address,
    'ward', p.ward, 'district', p.district, 'city', p.city,
    'approval_status', p.approval_status, 'lifecycle_status', p.lifecycle_status
  ) order by p.created_at desc), '[]'::jsonb)
  into v_candidates
  from public.properties p
  where p.normalized_property_key = v_key
    and coalesce(p.lifecycle_status, 'active') <> 'archived';

  v_count := jsonb_array_length(v_candidates);
  return jsonb_build_object(
    'ok', true,
    'match_status', case when v_count = 0 then 'not_found' when v_count = 1 then 'matched' else 'ambiguous' end,
    'property_id', case when v_count = 1 then (v_candidates->0->>'id')::uuid else null end,
    'candidates', v_candidates
  );
end;
$function$;

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
  v_resolution jsonb;
  v_candidate_count integer;
begin
  select au.level into v_level from public.admin_users au where au.user_id = v_uid limit 1;
  if v_uid is null or coalesce(v_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing from public.rooms where id = v_id for update;
  v_room_exists := found;
  v_property_id := v_existing.property_id;

  if v_property_id is null and nullif(p_payload->>'property_id', '') is not null then
    v_property_id := (p_payload->>'property_id')::uuid;
  end if;

  if v_property_id is null then
    v_resolution := public.admin_resolve_property_for_room_v2(p_payload);
    v_candidate_count := jsonb_array_length(coalesce(v_resolution->'candidates', '[]'::jsonb));
    if v_candidate_count > 1 then
      raise exception using errcode = 'P0001', message = 'PROPERTY_MATCH_REQUIRED', detail = (v_resolution->'candidates')::text;
    elsif v_candidate_count = 1 then
      v_property_id := (v_resolution->'candidates'->0->>'id')::uuid;
    end if;
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = v_property_id and coalesce(p.lifecycle_status, 'active') <> 'archived'
  ) then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_room_exists then
    update public.rooms r set
      room_code = nullif(p_payload->>'room_code', ''),
      room_type = nullif(p_payload->>'room_type', ''),
      house_number = nullif(p_payload->>'house_number', ''),
      address = nullif(p_payload->>'address', ''),
      ward = nullif(p_payload->>'ward', ''),
      district = nullif(p_payload->>'district', ''),
      price = case when p_payload ? 'price' then nullif(p_payload->>'price', '')::bigint else r.price end,
      status = nullif(p_payload->>'status', ''),
      description = nullif(p_payload->>'description', ''),
      link_zalo = nullif(p_payload->>'link_zalo', ''),
      zalo_phone = nullif(p_payload->>'zalo_phone', ''),
      chinh_sach = nullif(p_payload->>'chinh_sach', ''),
      property_id = coalesce(r.property_id, v_property_id),
      updated_at = now()
    where r.id = v_id returning * into v_row;
  else
    insert into public.rooms (
      id, room_code, room_type, house_number, address, ward, district,
      price, status, description, link_zalo, zalo_phone, chinh_sach,
      owner_id, property_id, publish_status, created_at, updated_at
    ) values (
      v_id, nullif(p_payload->>'room_code', ''), nullif(p_payload->>'room_type', ''),
      nullif(p_payload->>'house_number', ''), nullif(p_payload->>'address', ''),
      nullif(p_payload->>'ward', ''), nullif(p_payload->>'district', ''),
      nullif(p_payload->>'price', '')::bigint, nullif(p_payload->>'status', ''),
      nullif(p_payload->>'description', ''), nullif(p_payload->>'link_zalo', ''),
      nullif(p_payload->>'zalo_phone', ''), nullif(p_payload->>'chinh_sach', ''),
      coalesce(nullif(p_payload->>'owner_id', '')::uuid, v_uid), v_property_id,
      case when v_property_id is null then 'published'
        when exists (select 1 from public.properties p where p.id = v_property_id and p.approval_status = 'approved' and p.lifecycle_status = 'active') then 'published'
        else 'draft' end,
      now(), now()
    ) returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.get_owner_property_room_candidates_v1(p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_key text;
  v_candidates jsonb;
begin
  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select p.normalized_property_key into v_key from public.properties p where p.id = p_property_id;
  if v_key is null then return jsonb_build_object('candidates', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'room_code', r.room_code, 'price', r.price,
    'house_number', r.house_number, 'address', r.address,
    'ward', r.ward, 'district', r.district,
    'cover_image', (select rm.url from public.room_media rm where rm.room_id = r.id and rm.type = 'image' order by rm.is_cover desc nulls last, rm.sort_order, rm.created_at limit 1)
  ) order by r.room_code, r.created_at), '[]'::jsonb)
  into v_candidates
  from public.rooms r
  where r.property_id is null
    and r.normalized_property_key = v_key
    and coalesce(r.lifecycle_status, 'active') = 'active';

  return jsonb_build_object('candidates', v_candidates);
end;
$function$;

create or replace function public.assign_owner_property_room_candidate_v1(p_property_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_property public.properties%rowtype;
  v_room public.rooms%rowtype;
  v_phone text;
begin
  if not exists (select 1 from public.property_members pm where pm.property_id = p_property_id and pm.user_id = v_uid and pm.role = 'owner' and pm.status = 'active') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_property from public.properties where id = p_property_id for update;
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_room.property_id is not null then raise exception 'ROOM_ALREADY_ASSIGNED' using errcode = '23505'; end if;
  if v_room.normalized_property_key is distinct from v_property.normalized_property_key then
    raise exception 'PROPERTY_KEY_MISMATCH' using errcode = '22023';
  end if;

  select cp.phone into v_phone
  from public.member_contact_phones cp
  where cp.user_id = v_uid
  order by cp.is_primary desc nulls last, cp.is_verified desc nulls last, cp.id
  limit 1;

  update public.rooms set
    property_id = p_property_id,
    zalo_phone = coalesce(nullif(v_phone, ''), zalo_phone),
    updated_at = now()
  where id = p_room_id returning * into v_room;

  insert into public.room_lifecycle_audit (
    room_id, actor_user_id, actor_role, action, reason, source, metadata
  ) values (
    p_room_id, v_uid, 'owner', 'property_assigned',
    'Phòng được chủ nhà xác nhận thuộc tòa nhà.', 'room_property_assigned_by_owner',
    jsonb_build_object('property_id', p_property_id, 'normalized_property_key', v_room.normalized_property_key)
  );

  return jsonb_build_object('ok', true, 'room', to_jsonb(v_room));
end;
$function$;

create or replace function public.get_my_phone_property_suggestions_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id, 'code', candidate.code, 'house_number', candidate.house_number,
    'address', candidate.address, 'ward', candidate.ward,
    'district', candidate.district, 'city', candidate.city
  )), '[]'::jsonb) into v_result
  from (
    select distinct p.id, p.code, p.house_number, p.address, p.ward, p.district, p.city
    from public.properties p
    join public.rooms r on r.property_id = p.id
    where exists (
      select 1 from public.member_contact_phones cp
      where cp.user_id = v_uid
        and public.owner_phone_key_v1(cp.phone) is not null
        and regexp_replace(coalesce(r.zalo_phone, ''), '[^0-9]', '', 'g') like '%' || public.owner_phone_key_v1(cp.phone) || '%'
    )
    and not exists (
      select 1 from public.property_members pm
      where pm.property_id = p.id and pm.user_id = v_uid and pm.status = 'active'
    )
    and coalesce(p.lifecycle_status, 'active') <> 'archived'
  ) candidate;
  return jsonb_build_object('suggestions', v_result);
end;
$function$;

-- Compatibility guard: phone matching is discovery only and must never grant
-- a property_members/property_owners relationship.
create or replace function public.claim_admin_properties_by_phone_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_suggestions jsonb;
begin
  v_suggestions := public.get_my_phone_property_suggestions_v1();
  return jsonb_build_object(
    'ok', true,
    'claimed_count', 0,
    'properties', '[]'::jsonb,
    'suggestions', coalesce(v_suggestions->'suggestions', '[]'::jsonb)
  );
end;
$function$;

create or replace function public.resolve_duplicate_property_owner_v1(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_request_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.properties p where p.id = p_property_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select pjr.id into v_request_id
  from public.property_join_requests pjr
  where pjr.property_id = p_property_id
    and pjr.requester_user_id = v_uid
    and pjr.status = 'pending'
  order by pjr.created_at desc
  limit 1;

  if v_request_id is null then
    raise exception 'JOIN_REQUEST_REQUIRED' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'mode', 'verification_pending',
    'property_id', p_property_id,
    'request_id', v_request_id
  );
end;
$function$;

revoke all on function public.property_address_key_v2(text, text, text) from public, anon;
revoke all on function public.sync_normalized_property_key_v2() from public, anon, authenticated;
revoke all on function public.admin_resolve_property_for_room_v2(jsonb) from public, anon;
revoke all on function public.admin_upsert_room_v2(uuid, jsonb) from public, anon;
revoke all on function public.get_owner_property_room_candidates_v1(uuid) from public, anon;
revoke all on function public.assign_owner_property_room_candidate_v1(uuid, uuid) from public, anon;
revoke all on function public.get_my_phone_property_suggestions_v1() from public, anon;
revoke all on function public.claim_admin_properties_by_phone_v1() from public, anon;
revoke all on function public.resolve_duplicate_property_owner_v1(uuid) from public, anon;
grant execute on function public.admin_resolve_property_for_room_v2(jsonb) to authenticated, service_role;
grant execute on function public.admin_upsert_room_v2(uuid, jsonb) to authenticated, service_role;
grant execute on function public.get_owner_property_room_candidates_v1(uuid) to authenticated, service_role;
grant execute on function public.assign_owner_property_room_candidate_v1(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_phone_property_suggestions_v1() to authenticated, service_role;
grant execute on function public.claim_admin_properties_by_phone_v1() to authenticated, service_role;
grant execute on function public.resolve_duplicate_property_owner_v1(uuid) to authenticated, service_role;

commit;
