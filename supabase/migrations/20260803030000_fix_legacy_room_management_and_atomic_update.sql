begin;

create or replace function public.can_manage_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and (
        r.owner_id = auth.uid()
        or (r.property_id is not null and public.can_manage_property(r.property_id))
      )
  );
$function$;

create or replace function public.update_owner_room_full_v2(p_room_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_room public.rooms%rowtype;
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
    status = coalesce(nullif(btrim(p_payload->>'status'), ''), status),
    updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return v_result || jsonb_build_object('room', to_jsonb(v_room));
end;
$function$;

revoke all on function public.can_manage_room(uuid) from public, anon;
grant execute on function public.can_manage_room(uuid) to authenticated, service_role;
revoke all on function public.update_owner_room_full_v2(uuid, jsonb) from public, anon;
grant execute on function public.update_owner_room_full_v2(uuid, jsonb) to authenticated, service_role;

commit;
