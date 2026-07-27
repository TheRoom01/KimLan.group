begin;

create or replace function public.update_owner_room_full_v1(
  p_room_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.rooms%rowtype;
  v_room public.rooms%rowtype;
  v_room_code text;
  v_room_type text;
  v_description text;
  v_chinh_sach text;
  v_link_zalo text;
  v_zalo_phone text;
  v_publish_status text;
  v_price bigint;
  v_details jsonb;
  v_details_saved boolean := false;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'room_id is required';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'payload must be a JSON object';
  end if;

  select r.*
  into v_existing
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Room not found';
  end if;

  if not public.can_manage_room(p_room_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  if v_existing.lifecycle_status = 'archived' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Cannot update an archived room';
  end if;

  v_room_code := nullif(btrim(p_payload->>'room_code'), '');
  v_room_type := nullif(btrim(p_payload->>'room_type'), '');
  v_description := nullif(btrim(p_payload->>'description'), '');
  v_chinh_sach := nullif(btrim(p_payload->>'chinh_sach'), '');
  v_link_zalo := nullif(btrim(p_payload->>'link_zalo'), '');
  v_zalo_phone := nullif(btrim(p_payload->>'zalo_phone'), '');
  v_publish_status := coalesce(
    nullif(btrim(p_payload->>'publish_status'), ''),
    v_existing.publish_status,
    'draft'
  );

  if v_room_code is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'room_code is required';
  end if;

  if v_publish_status not in ('draft', 'published', 'hidden') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'publish_status is invalid';
  end if;

  if exists (
    select 1
    from public.rooms r
    where r.property_id = v_existing.property_id
      and r.id <> p_room_id
      and r.lifecycle_status = 'active'
      and lower(btrim(coalesce(r.room_code, ''))) = lower(v_room_code)
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
  else
    v_price := null;
  end if;

  v_details := case
    when jsonb_typeof(p_payload->'room_details') = 'object'
      then p_payload->'room_details'
    when jsonb_typeof(p_payload->'details') = 'object'
      then p_payload->'details'
    else null
  end;

  update public.rooms
  set
    room_code = v_room_code,
    room_type = v_room_type,
    price = v_price,
    description = v_description,
    chinh_sach = v_chinh_sach,
    link_zalo = v_link_zalo,
    zalo_phone = v_zalo_phone,
    publish_status = v_publish_status
  where id = p_room_id
  returning *
  into v_room;

  if v_details is not null then
    perform public.save_room_details_v1(
      p_room_id,
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
on function public.update_owner_room_full_v1(uuid, jsonb)
from public, anon;

grant execute
on function public.update_owner_room_full_v1(uuid, jsonb)
to authenticated, service_role;

commit;
