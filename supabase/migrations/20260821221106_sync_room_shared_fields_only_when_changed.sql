begin;

create or replace function public.sync_property_shared_room_fields_v1(
  p_property_id uuid,
  p_link_zalo text,
  p_google_maps_url text,
  p_chinh_sach text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room_count integer;
  v_link_zalo text := nullif(btrim(p_link_zalo), '');
  v_google_maps_url text := nullif(btrim(p_google_maps_url), '');
  v_chinh_sach text := nullif(btrim(p_chinh_sach), '');
  v_zalo_phone text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select nullif(btrim(p.default_room_data->>'zalo_phone'), '')
  into v_zalo_phone
  from public.properties p
  where p.id = p_property_id;
  if not found then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if length(coalesce(v_link_zalo, '')) > 2000
    or length(coalesce(v_google_maps_url, '')) > 2000
    or length(coalesce(v_chinh_sach, '')) > 10000
    or length(coalesce(v_zalo_phone, '')) > 300 then
    raise exception 'INVALID_SHARED_FIELD_LENGTH' using errcode = '22023';
  end if;

  update public.properties p
  set
    google_maps_url = v_google_maps_url,
    default_room_data = coalesce(p.default_room_data, '{}'::jsonb)
      || jsonb_build_object(
        'link_zalo', v_link_zalo,
        'chinh_sach', v_chinh_sach,
        'zalo_phone', v_zalo_phone
      ),
    updated_at = now()
  where p.id = p_property_id
    and (
      nullif(btrim(p.google_maps_url), '') is distinct from v_google_maps_url
      or nullif(btrim(p.default_room_data->>'link_zalo'), '') is distinct from v_link_zalo
      or nullif(btrim(p.default_room_data->>'chinh_sach'), '') is distinct from v_chinh_sach
      or nullif(btrim(p.default_room_data->>'zalo_phone'), '') is distinct from v_zalo_phone
    );

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  update public.rooms r
  set
    link_zalo = v_link_zalo,
    google_maps_url = v_google_maps_url,
    chinh_sach = v_chinh_sach,
    zalo_phone = v_zalo_phone,
    updated_at = now()
  where r.property_id = p_property_id
    and (
      nullif(btrim(r.link_zalo), '') is distinct from v_link_zalo
      or nullif(btrim(r.google_maps_url), '') is distinct from v_google_maps_url
      or nullif(btrim(r.chinh_sach), '') is distinct from v_chinh_sach
      or nullif(btrim(r.zalo_phone), '') is distinct from v_zalo_phone
    );
  get diagnostics v_room_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'changed', v_room_count > 0,
    'property_id', p_property_id,
    'rooms_updated', v_room_count
  );
end;
$function$;

create or replace function public.sync_room_shared_property_fields_v1(
  p_room_id uuid,
  p_link_zalo text,
  p_google_maps_url text,
  p_chinh_sach text,
  p_prefer_property_when_empty boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_property_id uuid;
  v_admin_level integer;
  v_room_count integer;
  v_link_zalo text := nullif(btrim(p_link_zalo), '');
  v_google_maps_url text := nullif(btrim(p_google_maps_url), '');
  v_chinh_sach text := nullif(btrim(p_chinh_sach), '');
  v_zalo_phone text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select r.property_id, nullif(btrim(r.zalo_phone), '')
  into v_property_id, v_zalo_phone
  from public.rooms r
  where r.id = p_room_id
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select au.level
  into v_admin_level
  from public.admin_users au
  where au.user_id = auth.uid()
  limit 1;

  if coalesce(v_admin_level, 0) not in (1, 2)
    and not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(coalesce(v_link_zalo, '')) > 2000
    or length(coalesce(v_google_maps_url, '')) > 2000
    or length(coalesce(v_chinh_sach, '')) > 10000
    or length(coalesce(v_zalo_phone, '')) > 300 then
    raise exception 'INVALID_SHARED_FIELD_LENGTH' using errcode = '22023';
  end if;

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);

  if v_property_id is not null and p_prefer_property_when_empty then
    select
      coalesce(v_link_zalo, nullif(btrim(p.default_room_data->>'link_zalo'), '')),
      coalesce(v_google_maps_url, nullif(btrim(p.google_maps_url), '')),
      coalesce(v_chinh_sach, nullif(btrim(p.default_room_data->>'chinh_sach'), '')),
      coalesce(v_zalo_phone, nullif(btrim(p.default_room_data->>'zalo_phone'), ''))
    into v_link_zalo, v_google_maps_url, v_chinh_sach, v_zalo_phone
    from public.properties p
    where p.id = v_property_id;
  end if;

  if v_property_id is null then
    update public.rooms r
    set
      link_zalo = v_link_zalo,
      google_maps_url = v_google_maps_url,
      chinh_sach = v_chinh_sach,
      zalo_phone = v_zalo_phone,
      updated_at = now()
    where r.id = p_room_id
      and (
        nullif(btrim(r.link_zalo), '') is distinct from v_link_zalo
        or nullif(btrim(r.google_maps_url), '') is distinct from v_google_maps_url
        or nullif(btrim(r.chinh_sach), '') is distinct from v_chinh_sach
        or nullif(btrim(r.zalo_phone), '') is distinct from v_zalo_phone
      );
    get diagnostics v_room_count = row_count;
  else
    update public.properties p
    set
      google_maps_url = v_google_maps_url,
      default_room_data = coalesce(p.default_room_data, '{}'::jsonb)
        || jsonb_build_object(
          'link_zalo', v_link_zalo,
          'chinh_sach', v_chinh_sach,
          'zalo_phone', v_zalo_phone
        ),
      updated_at = now()
    where p.id = v_property_id
      and (
        nullif(btrim(p.google_maps_url), '') is distinct from v_google_maps_url
        or nullif(btrim(p.default_room_data->>'link_zalo'), '') is distinct from v_link_zalo
        or nullif(btrim(p.default_room_data->>'chinh_sach'), '') is distinct from v_chinh_sach
        or nullif(btrim(p.default_room_data->>'zalo_phone'), '') is distinct from v_zalo_phone
      );

    update public.rooms r
    set
      link_zalo = v_link_zalo,
      google_maps_url = v_google_maps_url,
      chinh_sach = v_chinh_sach,
      zalo_phone = v_zalo_phone,
      updated_at = now()
    where r.property_id = v_property_id
      and (
        nullif(btrim(r.link_zalo), '') is distinct from v_link_zalo
        or nullif(btrim(r.google_maps_url), '') is distinct from v_google_maps_url
        or nullif(btrim(r.chinh_sach), '') is distinct from v_chinh_sach
        or nullif(btrim(r.zalo_phone), '') is distinct from v_zalo_phone
      );
    get diagnostics v_room_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_room_count > 0,
    'property_id', v_property_id,
    'rooms_updated', v_room_count
  );
end;
$function$;

create or replace function public.update_owner_room_full_v2(p_room_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
    perform public.update_owner_room_status_v1(
      p_room_id,
      v_status,
      'Cập nhật từ biểu mẫu chỉnh sửa phòng'
    );
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
$function$;

revoke all on function public.sync_property_shared_room_fields_v1(uuid, text, text, text)
from public, anon;
revoke all on function public.sync_room_shared_property_fields_v1(uuid, text, text, text, boolean)
from public, anon;
revoke all on function public.update_owner_room_full_v2(uuid, jsonb)
from public, anon;

grant execute on function public.sync_property_shared_room_fields_v1(uuid, text, text, text)
to authenticated, service_role;
grant execute on function public.sync_room_shared_property_fields_v1(uuid, text, text, text, boolean)
to authenticated, service_role;
grant execute on function public.update_owner_room_full_v2(uuid, jsonb)
to authenticated, service_role;

commit;
