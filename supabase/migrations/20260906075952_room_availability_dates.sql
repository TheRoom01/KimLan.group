-- Applied with user approval on 2026-09-06.
-- Store a date independently of rental contracts; legacy upcoming rooms may have no date.
alter table public.rooms add column if not exists available_from date;
comment on column public.rooms.available_from is 'Ngày phòng dự kiến trống do người quản lý chọn';

create or replace function public.clear_room_availability_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from 'Sắp trống' then new.available_from := null; end if;
  return new;
end;
$$;
create trigger clear_room_availability before insert or update of status, available_from on public.rooms
for each row execute function public.clear_room_availability_v1();

create or replace function public.update_owner_room_status_v2(p_room_id uuid, p_new_status text, p_available_from date, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_new_status = 'Sắp trống' and p_available_from is null then
    raise exception 'Vui lòng chọn ngày trống' using errcode = '22023';
  end if;
  -- The original function performs ownership, contract and status checks and audit logging.
  result := public.update_owner_room_status_v1(p_room_id, p_new_status, p_note);
  update public.rooms set available_from = case when p_new_status = 'Sắp trống' then p_available_from end, updated_at = now() where id = p_room_id;
  return result || jsonb_build_object('available_from', case when p_new_status = 'Sắp trống' then p_available_from end);
end;
$$;
revoke all on function public.update_owner_room_status_v2(uuid,text,date,text) from public, anon;
grant execute on function public.update_owner_room_status_v2(uuid,text,date,text) to authenticated;

create or replace function public.update_room_status_admin_v2(p_room_id uuid, p_status text, p_available_from date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_status = 'Sắp trống' and p_available_from is null then
    raise exception 'Vui lòng chọn ngày trống' using errcode = '22023';
  end if;
  -- Preserve the existing L1/L2 permission check.
  perform public.update_room_status_admin_v1(p_room_id, p_status);
  update public.rooms set available_from = case when p_status = 'Sắp trống' then p_available_from end, updated_at = now()
  where id = p_room_id
  returning jsonb_build_object('id', id, 'status', status, 'available_from', available_from) into result;
  return result;
end;
$$;
revoke all on function public.update_room_status_admin_v2(uuid,text,date) from public, anon;
grant execute on function public.update_room_status_admin_v2(uuid,text,date) to authenticated;

CREATE OR REPLACE FUNCTION public.admin_l1_save_hidden_room_v1(p_room_id uuid, p_payload jsonb, p_visibility_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before public.rooms%rowtype;
  v_result jsonb;
  v_after public.rooms%rowtype;
  v_publish_status text;
begin
  if not coalesce(public.is_admin_l1(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_visibility_action not in ('keep_hidden', 'restore') then raise exception 'INVALID_VISIBILITY_ACTION' using errcode = '22023'; end if;
  select * into v_before from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (coalesce(v_before.is_hidden, false) or v_before.lifecycle_status = 'archived' or v_before.publish_status = 'hidden') then
    raise exception 'ROOM_IS_NOT_HIDDEN' using errcode = '22023';
  end if;

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  v_result := public.admin_upsert_room_v1(p_room_id, p_payload);

  if p_payload ? 'available_from' then
    if p_payload->>'status' = 'Sắp trống' and nullif(p_payload->>'available_from', '') is null then
      raise exception 'Vui lòng chọn ngày trống' using errcode = '22023';
    end if;
    update public.rooms set available_from = case when status = 'Sắp trống' then nullif(p_payload->>'available_from', '')::date end where id = p_room_id;
  end if;

  if p_visibility_action = 'restore' then
    select case when p.approval_status = 'approved' and p.lifecycle_status = 'active' then 'published' else 'draft' end
      into v_publish_status from public.properties p where p.id = v_before.property_id;
    perform set_config('app.room_audit_source', 'room_restored_by_admin_l1', true);
    update public.rooms set lifecycle_status = 'active', publish_status = coalesce(v_publish_status, 'draft'),
      is_hidden = false, archived_at = null, archived_by = null, updated_at = now()
    where id = p_room_id returning * into v_after;
  else
    select * into v_after from public.rooms where id = p_room_id;
    insert into public.room_lifecycle_audit (
      room_id, actor_user_id, actor_role, action, reason,
      previous_lifecycle_status, new_lifecycle_status,
      previous_publish_status, new_publish_status,
      previous_is_hidden, new_is_hidden, source
    ) values (
      p_room_id, auth.uid(), 'admin_l1', 'updated_while_hidden',
      'Admin L1 cập nhật thông tin và tiếp tục giữ phòng ở trạng thái ẩn.',
      v_before.lifecycle_status, v_after.lifecycle_status,
      v_before.publish_status, v_after.publish_status,
      v_before.is_hidden, v_after.is_hidden, 'room_updated_while_hidden_by_admin_l1'
    );
  end if;
  return to_jsonb(v_after);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_room_v3(p_room_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if p_payload ? 'available_from' then
    if p_payload->>'status' = 'Sắp trống' and nullif(p_payload->>'available_from', '') is null then
      raise exception 'Vui lòng chọn ngày trống' using errcode = '22023';
    end if;
    update public.rooms set available_from = case when status = 'Sắp trống' then nullif(p_payload->>'available_from', '')::date end
    where id = (v_result->>'id')::uuid;
    v_result := v_result || jsonb_build_object('available_from', (select available_from from public.rooms where id = (v_result->>'id')::uuid));
  end if;

  if v_level = 2
    and nullif(v_result->>'owner_id', '')::uuid is distinct from v_uid then
    v_result := v_result
      || jsonb_build_object('link_zalo', null, 'zalo_phone', null);
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_owner_room_full_v3(p_property_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    price, status, available_from, description, chinh_sach, link_zalo, zalo_phone,
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
    coalesce(nullif(btrim(p_payload->>'status'), ''), 'Äang trá»‘ng'),
    nullif(p_payload->>'available_from', '')::date,
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_owner_room_full_v2(p_room_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_existing public.rooms%rowtype;
  v_room public.rooms%rowtype;
  v_status text;
  v_should_sync_property boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if p_room_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if not public.can_manage_room(p_room_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select r.*
  into v_existing
  from public.rooms r
  where r.id = p_room_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  v_should_sync_property :=
    nullif(btrim(p_payload->>'link_zalo'), '') is distinct from nullif(btrim(v_existing.link_zalo), '')
    or nullif(btrim(p_payload->>'google_maps_url'), '') is distinct from nullif(btrim(v_existing.google_maps_url), '')
    or nullif(btrim(p_payload->>'chinh_sach'), '') is distinct from nullif(btrim(v_existing.chinh_sach), '')
    or nullif(btrim(p_payload->>'zalo_phone'), '') is distinct from nullif(btrim(v_existing.zalo_phone), '');

  if coalesce(public.is_admin_l1(), false) then
    perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  end if;

  v_status := nullif(btrim(p_payload->>'status'), '');
  if v_status is not null then
    if p_payload ? 'available_from' then
      perform public.update_owner_room_status_v2(p_room_id, v_status, nullif(p_payload->>'available_from', '')::date, 'Cập nhật từ biểu mẫu chỉnh sửa phòng');
    else
      perform public.update_owner_room_status_v1(p_room_id, v_status, 'Cập nhật từ biểu mẫu chỉnh sửa phòng');
    end if;
  end if;

  v_result := public.update_owner_room_full_v1(p_room_id, p_payload);

  if coalesce(v_should_sync_property, false) then
    perform public.sync_room_shared_property_fields_v1(
      p_room_id,
      nullif(btrim(p_payload->>'link_zalo'), ''),
      nullif(btrim(p_payload->>'google_maps_url'), ''),
      nullif(btrim(p_payload->>'chinh_sach'), ''),
      false
    );
  end if;

  update public.rooms
  set
    house_number = nullif(btrim(p_payload->>'house_number'), ''),
    address = nullif(btrim(p_payload->>'address'), ''),
    ward = nullif(btrim(p_payload->>'ward'), ''),
    district = nullif(btrim(p_payload->>'district'), ''),
    updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_result || jsonb_build_object(
    'room', to_jsonb(v_room),
    'property_sync_called', coalesce(v_should_sync_property, false)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_room_detail_full_v1(p_id uuid, p_role integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  effective_role integer := 0;
  v_uid uuid := auth.uid();
  v_is_hidden boolean := false;
begin
  if v_uid is not null then
    select coalesce(level, 0)
    into effective_role
    from public.admin_users
    where user_id = v_uid
    limit 1;

    if effective_role not in (1, 2) then
      effective_role := 0;
    end if;
  else
    effective_role := 0;
  end if;

  select coalesce(r.is_hidden, false)
  into v_is_hidden
  from public.rooms r
  where r.id = p_id
  limit 1;

  if v_is_hidden = true and effective_role <> 1 then
    return null;
  end if;

  -- ADMIN L1: xem đầy đủ
  if effective_role = 1 then
    select
      to_jsonb(t)
      || jsonb_build_object(
        'media',
        coalesce(rm.media, '[]'::jsonb)
      )
      || jsonb_build_object(
        'room_details',
        to_jsonb(rd)
      )
      || jsonb_build_object(
        'room_detail',
        to_jsonb(rd)
      )
    into result
    from public.room_full_admin_l1 t
    left join public.room_media_agg rm
      on rm.room_id = t.id
    left join public.room_details rd
      on rd.room_id = t.id
    where t.id = p_id
    limit 1;

  -- ADMIN L2:
  -- phòng mình: thấy link_zalo + zalo_phone
  -- phòng người khác: trả null
  elsif effective_role = 2 then
    select
      (
        (to_jsonb(t) - 'link_zalo' - 'zalo_phone' - 'owner_id')

        || jsonb_build_object(
          'owner_id',
          r.owner_id
        )

        || jsonb_build_object(
          'link_zalo',
          case
            when r.owner_id = v_uid then r.link_zalo
            else null
          end
        )

        || jsonb_build_object(
          'zalo_phone',
          case
            when r.owner_id = v_uid then r.zalo_phone
            else null
          end
        )

        || jsonb_build_object(
          'media',
          coalesce(rm.media, '[]'::jsonb)
        )

        || jsonb_build_object(
          'room_details',
          to_jsonb(rd)
        )

        || jsonb_build_object(
          'room_detail',
          to_jsonb(rd)
        )
      )
    into result
    from public.room_full_admin_l2 t
    join public.rooms r
      on r.id = t.id
    left join public.room_media_agg rm
      on rm.room_id = t.id
    left join public.room_details rd
      on rd.room_id = t.id
    where t.id = p_id
    limit 1;

  -- PUBLIC
  else
    select
      (
        (
          to_jsonb(t)
          - 'link_zalo'
          - 'zalo_phone'
          - 'chinh_sach'
          - 'owner_id'
        )

        || jsonb_build_object(
          'link_zalo',
          null
        )

        || jsonb_build_object(
          'zalo_phone',
          null
        )

        || jsonb_build_object(
          'chinh_sach',
          null
        )

        || jsonb_build_object(
          'media',
          coalesce(rm.media, '[]'::jsonb)
        )

        || jsonb_build_object(
          'room_details',
          to_jsonb(rd)
        )

        || jsonb_build_object(
          'room_detail',
          to_jsonb(rd)
        )
      )
    into result
    from public.room_full_public t
    left join public.room_media_agg rm
      on rm.room_id = t.id
    left join public.room_details rd
      on rd.room_id = t.id
    where t.id = p_id
    limit 1;
  end if;

  if result is not null then
    result := result || jsonb_build_object('available_from', (select available_from from public.rooms where id = p_id));
  end if;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_rooms_cursor_full_v1(p_role integer, p_limit integer, p_cursor uuid, p_search text, p_min_price integer, p_max_price integer, p_districts text[], p_room_types text[], p_move text, p_pet_policies text[] DEFAULT NULL::text[], p_contract_terms text[] DEFAULT NULL::text[], p_statuses text[] DEFAULT NULL::text[], p_sort text DEFAULT NULL::text, p_cursor_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_anon_session_id uuid DEFAULT NULL::uuid, p_vip_token_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 s text := null;
 cursor_price integer := null;
 cursor_search_score integer := null;

 effective_role integer := 0;
 v_uid uuid := auth.uid();

 v_next uuid := null;
 v_next_cursor jsonb := null;
 v_data jsonb := '[]'::jsonb;
 v_total integer := 0;
 v_is_vip boolean := false;

 sort_mode text := coalesce(nullif(p_sort, ''), 'updated_desc');

 anon_limit integer := 20;
 anon_search text := null;
 anon_min_price integer := null;
 anon_max_price integer := null;
 anon_districts text[] := null;
 anon_room_types text[] := null;
 anon_move text := null;
 anon_pet_policies text[] := null;
 anon_contract_terms text[] := null;
 anon_statuses text[] := null;
 anon_sort text := 'updated_desc';
begin
 if v_uid is not null then
  select coalesce(level, 0)
    into effective_role
  from public.admin_users
  where user_id = v_uid
  limit 1;

  if effective_role not in (1, 2) then
    effective_role := 0;
  end if;
else
  effective_role := 0;
 end if;


SELECT EXISTS(
  SELECT 1
  FROM public.vip_access_links
  WHERE token_hash = p_vip_token_hash
    AND revoked_at IS NULL
    AND expires_at > now()
)
INTO v_is_vip;


if effective_role = 0 
and v_is_vip = false then

  if p_anon_session_id is null then
    return jsonb_build_object(
      'data',
      '[]'::jsonb,
      'nextCursor',
      null,
      'total_count',
      0
    );
  end if;


  if not exists (
    select 1
    from public.anon_sessions s0
    where s0.id = p_anon_session_id
      and (
        s0.created_at > now() - interval '60 seconds'
        or coalesce(
          s0.unlocked_until,
          '-infinity'::timestamptz
        ) > now()
      )
  ) then

    return jsonb_build_object(
      'data',
      '[]'::jsonb,
      'nextCursor',
      null,
      'total_count',
      0
    );

  end if;

end if;

 if p_search is not null then
  s := public.norm_room_search_text(btrim(p_search));
  if length(s) < 2 then
    s := null;
  end if;
 end if;

 if effective_role = 0 then
  if sort_mode not in ('updated_desc', 'price_asc', 'price_desc') then
    sort_mode := 'updated_desc';
  end if;

  if p_cursor is not null and sort_mode in ('price_asc', 'price_desc') then
    select v.price
    into cursor_price
    from public.room_full_public v
    where v.id = p_cursor;
  end if;

  if s is not null and p_cursor is not null then

    select
      greatest(
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s then 1000 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%' then 900 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%' then 800 else 0 end,
        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
      )::int
    into cursor_search_score
    from public.room_full_public v
    where v.id = p_cursor;
  end if;

  with base as (
    select
      v.id,
      v.updated_at as updated_at,
      v.created_at as created_at,
      v.price as price,
      v.address as address,
      v.ward as ward,
      v.district as district,
      v.room_code as room_code,
      case
        when s is null then 0
        else greatest(
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s
            then 1000 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%'
            then 900 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 800 else 0
          end,
          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
        )
      end::int as search_score,
      (
        (to_jsonb(v)
          - 'gallery_urls'
          - 'link_zalo'
          - 'zalo_phone'
          - 'chinh_sach'
        )
        || jsonb_build_object(
          'has_video',
            exists (
              select 1
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'video'
                and coalesce(rm.url, '') <> ''
            ),
          'image_urls',
            (
              select coalesce(jsonb_agg(u), '[]'::jsonb)
              from (
                select rm.url as u
                from public.room_media rm
                where rm.room_id = v.id
                  and rm.type = 'image'
                  and coalesce(rm.url, '') <> ''
                order by rm.created_at asc
                limit 3
              ) t
            ),
          'image_count',
            (
              select count(*)::int
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'image'
                and coalesce(rm.url, '') <> ''
            ),
          'video_url',
            (
              select rm.url
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'video'
                and coalesce(rm.url, '') <> ''
              order by rm.created_at asc
              limit 1
            ),
          'thumb_url',
            (
              select rm.url
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'image'
                and coalesce(rm.url, '') <> ''
              order by rm.created_at asc
              limit 1
            ),
          'room_detail', to_jsonb(rd),
          'updated_at', v.updated_at,
          'creator_admin_phone', au.phone,
          'creator_admin_name', au.full_name,
        'available_from', r.available_from
        )
      ) as row_json
    from public.room_full_public v
    left join public.rooms r on r.id = v.id
    left join public.admin_users au on au.user_id = r.owner_id
    left join public.room_details rd on rd.room_id = v.id
    where
      (p_min_price is null or v.price >= p_min_price)
      and (p_max_price is null or v.price <= p_max_price)
      and (
        p_districts is null
        or cardinality(p_districts) = 0
        or v.district = any(p_districts)
      )
      and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))
      and (
        p_statuses is null
        or cardinality(p_statuses) = 0
        or v.status = any(p_statuses)
      )
      and (
        p_move is null
        or (p_move = 'elevator' and coalesce(rd.has_elevator, false) = true)
        or (p_move = 'stairs' and coalesce(rd.has_stairs, false) = true)
      )
      and (
        p_pet_policies is null
        or cardinality(p_pet_policies) = 0
        or (
          ('cat' = any(p_pet_policies) and coalesce(v.allow_cat, false) = true)
          or ('dog' = any(p_pet_policies) and coalesce(v.allow_dog, false) = true)
          or ('nopet' = any(p_pet_policies) and coalesce(v.no_pet, false) = true)
        )
      )
      and (
        p_contract_terms is null
        or cardinality(p_contract_terms) = 0
        or (
          ('short' = any(p_contract_terms) and coalesce(v.short_term, false) = true)
          or ('long' = any(p_contract_terms) and coalesce(v.long_term, true) = true)
        )
      )
      and (
        s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s
      )
  ),
  total_cte as (
    select count(*)::int as total_count from base
  ),
  src as (
    select
      b.id,
      b.updated_at,
      b.created_at,
      b.price,
      b.search_score,
      b.row_json
    from base b
    where
      (
        (
          s is not null
          and (
            p_cursor is null
            or cursor_search_score is null
            or b.search_score < cursor_search_score
            or (
              b.search_score = cursor_search_score
              and (
                (
                  p_cursor_updated_at is not null
                  and (
                    b.updated_at < p_cursor_updated_at
                    or (
                      b.updated_at = p_cursor_updated_at
                      and (
                        (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                        or (
                          p_cursor_created_at is not null
                          and b.created_at = p_cursor_created_at
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                        or (
                          p_cursor_created_at is null
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                      )
                    )
                  )
                )
                or (
                  p_cursor_updated_at is null
                  and p_cursor is not null
                  and b.id < p_cursor
                )
              )
            )
          )
        )
        or
        (
          s is null
          and (
            (
              sort_mode = 'updated_desc'
              and (
                p_cursor_updated_at is null
                or (b.updated_at < p_cursor_updated_at)
                or (
                  b.updated_at = p_cursor_updated_at
                  and (
                    (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                    or (
                      p_cursor_created_at is not null
                      and b.created_at = p_cursor_created_at
                      and p_cursor_id is not null
                      and b.id < p_cursor_id
                    )
                    or (
                      p_cursor_created_at is null
                      and p_cursor_id is not null
                      and b.id < p_cursor_id
                    )
                  )
                )
              )
            )
            or (
              sort_mode = 'price_asc'
              and cursor_price is not null
              and (b.price > cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              sort_mode = 'price_desc'
              and cursor_price is not null
              and (b.price < cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              (
                sort_mode not in ('updated_desc', 'price_asc', 'price_desc')
                or (
                  sort_mode in ('price_asc', 'price_desc')
                  and cursor_price is null
                )
              )
              and (p_cursor is null or b.id > p_cursor)
            )
            or (p_cursor is null and p_cursor_updated_at is null)
          )
        )
      )
    order by
      case when s is not null then b.search_score end desc,
      case when s is not null then b.updated_at end desc nulls last,
      case when s is not null then b.created_at end desc nulls last,
      case when s is not null then b.id end desc,

      case when s is null and sort_mode = 'price_asc' then b.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then b.id end asc,

      case when s is null and sort_mode = 'price_desc' then b.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then b.id end asc,

      case when s is null and sort_mode = 'updated_desc' then b.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.id end desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) + 1
  ),
  sliced as (
    select * from src limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ),
  has_more as (
    select exists(select 1 from src offset least(greatest(coalesce(p_limit, 20), 1), 50) limit 1) as ok
  ),
  last_row as (
    select id, updated_at, created_at, search_score
    from src
    offset greatest(least(greatest(coalesce(p_limit, 20), 1), 50) - 1, 0)
    limit 1
  )
  select
    coalesce(jsonb_agg(sliced.row_json), '[]'::jsonb),
    (select case when (select ok from has_more) then (select id from last_row) else null end),
    (select case when (select ok from has_more)
      then jsonb_build_object(
        'updated_at', (select updated_at from last_row),
        'created_at', (select created_at from last_row),
        'id', (select id from last_row),
        'search_score', (select search_score from last_row)
      )
      else null
    end),
    (select total_count from total_cte)
  into v_data, v_next, v_next_cursor, v_total
  from sliced;

  return jsonb_build_object(
    'data', v_data,
    'nextCursor',
    case
      when s is not null or sort_mode = 'updated_desc' then v_next_cursor
      else to_jsonb(v_next)
    end,
    'total_count', v_total
  );
 end if;

 if effective_role = 1 then
  if p_cursor is not null and sort_mode in ('price_asc', 'price_desc') then
    select v.price
    into cursor_price
    from public.room_full_admin_l1 v
    join public.rooms r on r.id = v.id
    where v.id = p_cursor;
  end if;

  if s is not null and p_cursor is not null then
    select
      greatest(
        case when public.norm_room_search_text(coalesce(v.house_number, '')) = s then 980 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s then 1000 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%' then 900 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%' then 800 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%' then 700 else 0 end,
        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
      )::int
    into cursor_search_score
    from public.room_full_admin_l1 v
    where v.id = p_cursor;
  end if;

  with base as (
    select
      v.id,
      v.updated_at as updated_at,
      r.created_at as created_at,
      v.price as price,
      v.house_number as house_number,
      v.address as address,
      v.ward as ward,
      v.district as district,
      v.room_code as room_code,
      case
        when s is null then 0
        else greatest(
          case
            when public.norm_room_search_text(coalesce(v.house_number, '')) = s
            then 980 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s
            then 1000 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%'
            then 900 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 800 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 700 else 0
          end,
          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
        )
      end::int as search_score,
      jsonb_build_object(
        'id', v.id,
        'room_code', v.room_code,
        'room_type', v.room_type,
        'house_number', v.house_number,
        'address', v.address,
        'ward', v.ward,
        'district', v.district,
        'price', v.price,
        'room_detail', to_jsonb(rd),
          'updated_at', v.updated_at,
        'status', v.status,
        'has_video',
          exists (
            select 1
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'video'
              and coalesce(rm.url, '') <> ''
          ),
        'video_url',
          (
            select rm.url
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'video'
              and coalesce(rm.url, '') <> ''
            order by rm.created_at asc
            limit 1
          ),
        'thumb_url',
          (
            select rm.url
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'image'
              and coalesce(rm.url, '') <> ''
            order by rm.created_at asc
            limit 1
          ),
        'image_urls',
          (
            select coalesce(jsonb_agg(u), '[]'::jsonb)
            from (
              select rm.url as u
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'image'
                and coalesce(rm.url, '') <> ''
              order by rm.created_at asc
              limit 3
            ) t
          ),
        'image_count',
          (
            select count(*)::int
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'image'
              and coalesce(rm.url, '') <> ''
          ),
        'description', v.description,
        'room_detail', to_jsonb(rd),
          'updated_at', v.updated_at,
        'owner_id', r.owner_id,
        'link_zalo',
          case
            when r.owner_id = v_uid then v.link_zalo
            else null
          end,
        'zalo_phone',
          case
            when r.owner_id = v_uid then v.zalo_phone
            else null
          end,
        'creator_admin_phone', au.phone,
        'creator_admin_name', au.full_name,
        'available_from', r.available_from
      ) as row_json
    from public.room_full_admin_l1 v
    join public.rooms r on r.id = v.id
    left join public.admin_users au on au.user_id = r.owner_id
    left join public.room_details rd on rd.room_id = v.id
    where
      (p_min_price is null or v.price >= p_min_price)
      and (p_max_price is null or v.price <= p_max_price)
      and (
        p_districts is null
        or cardinality(p_districts) = 0
        or v.district = any(p_districts)
      )
      and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))
      and (
        p_statuses is null
        or cardinality(p_statuses) = 0
        or v.status = any(p_statuses)
      )
      and (
        p_move is null
        or (p_move = 'elevator' and coalesce(rd.has_elevator, false) = true)
        or (p_move = 'stairs' and coalesce(rd.has_stairs, false) = true)
      )
      and (
        p_pet_policies is null
        or cardinality(p_pet_policies) = 0
        or (
          ('cat' = any(p_pet_policies) and coalesce(v.allow_cat, false) = true)
          or ('dog' = any(p_pet_policies) and coalesce(v.allow_dog, false) = true)
          or ('nopet' = any(p_pet_policies) and coalesce(v.no_pet, false) = true)
        )
      )
      and (
        p_contract_terms is null
        or cardinality(p_contract_terms) = 0
        or (
          ('short' = any(p_contract_terms) and coalesce(v.short_term, false) = true)
          or ('long' = any(p_contract_terms) and coalesce(v.long_term, true) = true)
        )
      )
      and (
        s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s
      )
  ),
  total_cte as (
    select count(*)::int as total_count from base
  ),
  src as (
    select
      b.id,
      b.updated_at,
      b.created_at,
      b.price,
      b.search_score,
      b.row_json
    from base b
    where
      (
        (
          s is not null
          and (
            p_cursor is null
            or cursor_search_score is null
            or b.search_score < cursor_search_score
            or (
              b.search_score = cursor_search_score
              and (
                (
                  p_cursor_updated_at is not null
                  and (
                    b.updated_at < p_cursor_updated_at
                    or (
                      b.updated_at = p_cursor_updated_at
                      and (
                        (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                        or (
                          p_cursor_created_at is not null
                          and b.created_at = p_cursor_created_at
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                        or (
                          p_cursor_created_at is null
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                      )
                    )
                  )
                )
                or (
                  p_cursor_updated_at is null
                  and p_cursor is not null
                  and b.id < p_cursor
                )
              )
            )
          )
        )
        or
        (
          s is null
          and (
            (
              sort_mode = 'updated_desc'
              and (
                p_cursor_updated_at is null
                or (b.updated_at < p_cursor_updated_at)
                or (
                  b.updated_at = p_cursor_updated_at
                  and (
                    (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                    or (
                      p_cursor_created_at is not null
                      and b.created_at = p_cursor_created_at
                      and p_cursor_id is not null
                      and b.id < p_cursor_id
                    )
                    or (
                      p_cursor_created_at is null
                      and p_cursor_id is null
                      and b.id < p_cursor_id
                    )
                  )
                )
              )
            )
            or (
              sort_mode = 'price_asc'
              and cursor_price is not null
              and (b.price > cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              sort_mode = 'price_desc'
              and cursor_price is not null
              and (b.price < cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              (
                sort_mode not in ('updated_desc', 'price_asc', 'price_desc')
                or (
                  sort_mode in ('price_asc', 'price_desc')
                  and cursor_price is null
                )
              )
              and (p_cursor is null or b.id > p_cursor)
            )
            or (p_cursor is null and p_cursor_updated_at is null)
          )
        )
      )
    order by
      case when s is not null then b.search_score end desc,
      case when s is not null then b.updated_at end desc nulls last,
      case when s is not null then b.created_at end desc nulls last,
      case when s is not null then b.id end desc,

      case when s is null and sort_mode = 'price_asc' then b.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then b.id end asc,

      case when s is null and sort_mode = 'price_desc' then b.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then b.id end asc,

      case when s is null and sort_mode = 'updated_desc' then b.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.id end desc
    limit p_limit + 1
  ),
  sliced as (
    select * from src limit p_limit
  ),
  has_more as (
    select exists(select 1 from src offset p_limit limit 1) as ok
  ),
  last_row as (
    select id, updated_at, created_at, search_score
    from src
    offset greatest(p_limit - 1, 0)
    limit 1
  )
  select
    coalesce(jsonb_agg(sliced.row_json), '[]'::jsonb),
    (select case when (select ok from has_more) then (select id from last_row) else null end),
    (select case when (select ok from has_more)
      then jsonb_build_object(
        'updated_at', (select updated_at from last_row),
        'created_at', (select created_at from last_row),
        'id', (select id from last_row),
        'search_score', (select search_score from last_row)
      )
      else null
    end),
    (select total_count from total_cte)
  into v_data, v_next, v_next_cursor, v_total
  from sliced;

  return jsonb_build_object(
    'data', v_data,
    'nextCursor',
    case
      when s is not null or sort_mode = 'updated_desc' then v_next_cursor
      else to_jsonb(v_next)
    end,
    'total_count', v_total
  );
 end if;

 if effective_role = 2 then
  if p_cursor is not null and sort_mode in ('price_asc', 'price_desc') then
    select v.price
    into cursor_price
    from public.room_full_admin_l2 v
    join public.rooms r on r.id = v.id
    where v.id = p_cursor;
  end if;

  if s is not null and p_cursor is not null then
    select
      greatest(
        case when public.norm_room_search_text(coalesce(v.house_number, '')) = s then 980 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s then 1000 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%' then 900 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%' then 800 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%' then 700 else 0 end,
        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
      )::int
    into cursor_search_score
    from public.room_full_admin_l2 v
    where v.id = p_cursor;
  end if;

  with base as (
    select
      v.id,
      v.updated_at as updated_at,
      r.created_at as created_at,
      v.price as price,
      v.house_number as house_number,
      v.address as address,
      v.ward as ward,
      v.district as district,
      v.room_code as room_code,
      case
        when s is null then 0
        else greatest(
          case
            when public.norm_room_search_text(coalesce(v.house_number, '')) = s
            then 980 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s
            then 1000 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%'
            then 900 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 800 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 700 else 0
          end,
          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
        )
      end::int as search_score,
      jsonb_build_object(
        'id', v.id,
        'room_code', v.room_code,
        'room_type', v.room_type,
        'house_number', v.house_number,
        'address', v.address,
        'ward', v.ward,
        'district', v.district,
        'price', v.price,
        'room_detail', to_jsonb(rd),
          'updated_at', v.updated_at,
        'status', v.status,
        'has_video',
          exists (
            select 1
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'video'
              and coalesce(rm.url, '') <> ''
          ),
        'video_url',
          (
            select rm.url
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'video'
              and coalesce(rm.url, '') <> ''
            order by rm.created_at asc
            limit 1
          ),
        'thumb_url',
          (
            select rm.url
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'image'
              and coalesce(rm.url, '') <> ''
            order by rm.created_at asc
            limit 1
          ),
        'image_urls',
          (
            select coalesce(jsonb_agg(u), '[]'::jsonb)
            from (
              select rm.url as u
              from public.room_media rm
              where rm.room_id = v.id
                and rm.type = 'image'
                and coalesce(rm.url, '') <> ''
              order by rm.created_at asc
              limit 3
            ) t
          ),
        'image_count',
          (
            select count(*)::int
            from public.room_media rm
            where rm.room_id = v.id
              and rm.type = 'image'
              and coalesce(rm.url, '') <> ''
          ),
        'description', v.description,
        'room_detail', to_jsonb(rd),
          'updated_at', v.updated_at,
        'owner_id', r.owner_id,
        'link_zalo',
          case
            when r.owner_id = v_uid then v.link_zalo
            else null
          end,
        'zalo_phone',
          case
            when r.owner_id = v_uid then v.zalo_phone
            else null
          end,
        'creator_admin_phone', au.phone,
        'creator_admin_name', au.full_name,
        'available_from', r.available_from
      ) as row_json
    from public.room_full_admin_l2 v
    join public.rooms r on r.id = v.id
    left join public.admin_users au on au.user_id = r.owner_id
    left join public.room_details rd on rd.room_id = v.id
    where
      coalesce(r.is_hidden, false) = false
      and (p_min_price is null or v.price >= p_min_price)
      and (p_max_price is null or v.price <= p_max_price)
      and (
        p_districts is null
        or cardinality(p_districts) = 0
        or v.district = any(p_districts)
      )
      and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))
      and (
        p_statuses is null
        or cardinality(p_statuses) = 0
        or v.status = any(p_statuses)
      )
      and (
        p_move is null
        or (p_move = 'elevator' and coalesce(rd.has_elevator, false) = true)
        or (p_move = 'stairs' and coalesce(rd.has_stairs, false) = true)
      )
      and (
        p_pet_policies is null
        or cardinality(p_pet_policies) = 0
        or (
          ('cat' = any(p_pet_policies) and coalesce(v.allow_cat, false) = true)
          or ('dog' = any(p_pet_policies) and coalesce(v.allow_dog, false) = true)
          or ('nopet' = any(p_pet_policies) and coalesce(v.no_pet, false) = true)
        )
      )
      and (
        p_contract_terms is null
        or cardinality(p_contract_terms) = 0
        or (
          ('short' = any(p_contract_terms) and coalesce(v.short_term, false) = true)
          or ('long' = any(p_contract_terms) and coalesce(v.long_term, true) = true)
        )
      )
      and (
        s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s
      )
  ),
  total_cte as (
    select count(*)::int as total_count from base
  ),
  src as (
    select
      b.id,
      b.updated_at,
      b.created_at,
      b.price,
      b.search_score,
      b.row_json
    from base b
    where
      (
        (
          s is not null
          and (
            p_cursor is null
            or cursor_search_score is null
            or b.search_score < cursor_search_score
            or (
              b.search_score = cursor_search_score
              and (
                (
                  p_cursor_updated_at is not null
                  and (
                    b.updated_at < p_cursor_updated_at
                    or (
                      b.updated_at = p_cursor_updated_at
                      and (
                        (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                        or (
                          p_cursor_created_at is not null
                          and b.created_at = p_cursor_created_at
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                        or (
                          p_cursor_created_at is null
                          and p_cursor_id is not null
                          and b.id < p_cursor_id
                        )
                      )
                    )
                  )
                )
                or (
                  p_cursor_updated_at is null
                  and p_cursor is not null
                  and b.id < p_cursor
                )
              )
            )
          )
        )
        or
        (
          s is null
          and (
            (
              sort_mode = 'updated_desc'
              and (
                p_cursor_updated_at is null
                or (b.updated_at < p_cursor_updated_at)
                or (
                  b.updated_at = p_cursor_updated_at
                  and (
                    (p_cursor_created_at is not null and b.created_at < p_cursor_created_at)
                    or (
                      p_cursor_created_at is not null
                      and b.created_at = p_cursor_created_at
                      and p_cursor_id is not null
                      and b.id < p_cursor_id
                    )
                    or (
                      p_cursor_created_at is null
                      and p_cursor_id is not null
                      and b.id < p_cursor_id
                    )
                  )
                )
              )
            )
            or (
              sort_mode = 'price_asc'
              and cursor_price is not null
              and (b.price > cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              sort_mode = 'price_desc'
              and cursor_price is not null
              and (b.price < cursor_price or (b.price = cursor_price and b.id > p_cursor))
            )
            or (
              (
                sort_mode not in ('updated_desc', 'price_asc', 'price_desc')
                or (
                  sort_mode in ('price_asc', 'price_desc')
                  and cursor_price is null
                )
              )
              and (p_cursor is null or b.id > p_cursor)
            )
            or (p_cursor is null and p_cursor_updated_at is null)
          )
        )
      )
    order by
      case when s is not null then b.search_score end desc,
      case when s is not null then b.updated_at end desc nulls last,
      case when s is not null then b.created_at end desc nulls last,
      case when s is not null then b.id end desc,

      case when s is null and sort_mode = 'price_asc' then b.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then b.id end asc,

      case when s is null and sort_mode = 'price_desc' then b.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then b.id end asc,

      case when s is null and sort_mode = 'updated_desc' then b.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then b.id end desc
    limit p_limit + 1
  ),
  sliced as (
    select * from src limit p_limit
  ),
  has_more as (
    select exists(select 1 from src offset p_limit limit 1) as ok
  ),
  last_row as (
    select id, updated_at, created_at, search_score
    from src
    offset greatest(p_limit - 1, 0)
    limit 1
  )
  select
    coalesce(jsonb_agg(sliced.row_json), '[]'::jsonb),
    (select case when (select ok from has_more) then (select id from last_row) else null end),
    (select case when (select ok from has_more)
      then jsonb_build_object(
        'updated_at', (select updated_at from last_row),
        'created_at', (select created_at from last_row),
        'id', (select id from last_row),
        'search_score', (select search_score from last_row)
      )
      else null
    end),
    (select total_count from total_cte)
  into v_data, v_next, v_next_cursor, v_total
  from sliced;

  return jsonb_build_object(
    'data', v_data,
    'nextCursor',
    case
      when s is not null or sort_mode = 'updated_desc' then v_next_cursor
      else to_jsonb(v_next)
    end,
    'total_count', v_total
  );
 end if;

 return jsonb_build_object('data', '[]'::jsonb, 'nextCursor', null, 'total_count', 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_admin_rooms_l1_v2(p_limit integer, p_offset integer, p_search text DEFAULT NULL::text, p_report text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_level integer := 0; s text := null;
  v_data jsonb := '[]'::jsonb; v_total integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(level, 0) into v_level from public.admin_users where user_id = v_uid limit 1;
  if v_level <> 1 then raise exception 'not_authorized'; end if;
  s := nullif(public.norm_room_search_text(p_search), '');
  if s is not null and length(s) < 3 then s := null; end if;

  with raw as (
    select r.id, r.created_at, r.updated_at, r.room_code, r.house_number, r.address,
      r.ward, r.district, r.room_type, r.status, source_room.available_from, r.link_zalo, r.zalo_phone,
      r.price, r.is_hidden, r.lat, r.lng
    from public.room_full_admin_l1 r
    join public.rooms source_room on source_room.id = r.id
    where (s is null
      or source_room.search_address_text like s || '%'
      or source_room.search_address_text like '%' || s || '%'
      or source_room.search_address_text operator(extensions.%) s)
      and (p_report is null
        or (p_report = 'no_zalo' and coalesce(trim(r.link_zalo), '') = '')
        or (p_report = 'no_owner_phone' and coalesce(trim(r.zalo_phone), '') = '')
        or (p_report = 'no_coordinates' and (r.lat is null or r.lng is null))
        or (p_report = 'hidden' and r.is_hidden = true)
        or (p_report = 'no_media' and not exists (
          select 1 from public.room_media_agg rma where rma.room_id = r.id
            and exists (select 1 from jsonb_array_elements(rma.media) m where m->>'type' = 'image')
        )))
  ), scored as materialized (
    select raw.*, case when s is null then 0 else public.room_address_search_score(
      raw.house_number, raw.address, raw.ward, raw.district, null, s
    ) end as search_score from raw
  ), total_cte as (select count(*)::integer as total_count from scored),
  page_cte as (
    select * from scored order by
      case when s is not null then search_score end desc,
      updated_at desc nulls last, created_at desc nulls last, id desc
    limit greatest(coalesce(p_limit, 20), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(to_jsonb(page_cte) - 'search_score' order by
      case when s is not null then page_cte.search_score end desc,
      page_cte.updated_at desc nulls last, page_cte.created_at desc nulls last, page_cte.id desc
    ), '[]'::jsonb), coalesce((select total_count from total_cte), 0)
  into v_data, v_total from page_cte;
  return jsonb_build_object('data', v_data, 'total', v_total, 'total_count', v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_admin_rooms_l2_v2(p_limit integer, p_offset integer, p_search text DEFAULT NULL::text, p_report text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_level integer := 0; s text := null;
  v_data jsonb := '[]'::jsonb; v_total integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(level, 0) into v_level from public.admin_users where user_id = v_uid limit 1;
  if v_level <> 2 then raise exception 'not_authorized'; end if;
  s := nullif(public.norm_room_search_text(p_search), '');
  if s is not null and length(s) < 3 then s := null; end if;

  with raw as (
    select v.id, r.owner_id, v.created_at, v.updated_at, v.room_code, v.house_number,
      v.address, v.ward, v.district, v.room_type, v.status, r.available_from,
      case when r.owner_id = v_uid then r.link_zalo else null end as link_zalo,
      case when r.owner_id = v_uid then r.zalo_phone else null end as zalo_phone,
      v.price, v.is_hidden, v.chinh_sach, null::double precision as lat,
      null::double precision as lng,
      exists (select 1 from public.room_media rm where rm.room_id = v.id
        and rm.type = 'image' and coalesce(rm.url, '') <> '') as has_image
    from public.room_full_admin_l2 v join public.rooms r on r.id = v.id
    where v.is_hidden = false
      and (s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s)
      and (p_report is null
        or (p_report = 'no_zalo' and r.owner_id = v_uid and coalesce(trim(r.link_zalo), '') = '')
        or (p_report = 'no_owner_phone' and r.owner_id = v_uid and coalesce(trim(r.zalo_phone), '') = '')
        or (p_report = 'no_media'
          and exists (select 1 from public.room_media rm2 where rm2.room_id = v.id)
          and not exists (select 1 from public.room_media rm3 where rm3.room_id = v.id
            and rm3.type = 'image' and coalesce(rm3.url, '') <> '')))
  ), scored as materialized (
    select raw.*, case when s is null then 0 else public.room_address_search_score(
      raw.house_number, raw.address, raw.ward, raw.district, null, s
    ) end as search_score from raw
  ), total_cte as (select count(*)::integer as total_count from scored),
  page_cte as (
    select * from scored order by
      case when s is not null then search_score end desc,
      updated_at desc nulls last, created_at desc nulls last, id desc
    limit greatest(coalesce(p_limit, 20), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(to_jsonb(page_cte) - 'search_score' order by
      case when s is not null then page_cte.search_score end desc,
      page_cte.updated_at desc nulls last, page_cte.created_at desc nulls last, page_cte.id desc
    ), '[]'::jsonb), coalesce((select total_count from total_cte), 0)
  into v_data, v_total from page_cte;
  return jsonb_build_object('data', v_data, 'total', v_total, 'total_count', v_total);
end;
$function$
;
