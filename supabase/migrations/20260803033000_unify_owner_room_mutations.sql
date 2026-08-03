begin;

create or replace function public.update_owner_room_full_v2(p_room_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_room public.rooms%rowtype;
  v_status text;
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

  -- Pressing Save in Owner Portal is the explicit confirmation required by
  -- the hidden-room guard. This override is only relevant to Admin L1; regular
  -- owners/managers remain constrained by can_manage_room above.
  if coalesce(public.is_admin_l1(), false) then
    perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  end if;

  v_status := nullif(btrim(p_payload->>'status'), '');
  if v_status is not null then
    perform public.update_owner_room_status_v1(p_room_id, v_status, 'Cập nhật từ biểu mẫu chỉnh sửa phòng');
  end if;

  v_result := public.update_owner_room_full_v1(p_room_id, p_payload);

  perform public.sync_room_shared_property_fields_v1(
    p_room_id,
    nullif(btrim(p_payload->>'link_zalo'), ''),
    nullif(btrim(p_payload->>'google_maps_url'), ''),
    nullif(btrim(p_payload->>'chinh_sach'), ''),
    false
  );

  update public.rooms
  set
    house_number = nullif(btrim(p_payload->>'house_number'), ''),
    address = nullif(btrim(p_payload->>'address'), ''),
    ward = nullif(btrim(p_payload->>'ward'), ''),
    district = nullif(btrim(p_payload->>'district'), ''),
    updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_result || jsonb_build_object('room', to_jsonb(v_room));
end;
$function$;

revoke all on function public.update_owner_room_full_v2(uuid, jsonb) from public, anon;
grant execute on function public.update_owner_room_full_v2(uuid, jsonb) to authenticated, service_role;

commit;
