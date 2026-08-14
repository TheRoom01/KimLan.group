begin;

create or replace function public.sync_property_defaults_from_latest_room_v1(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room record;
  v_details jsonb;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select r.*, to_jsonb(rd) - 'id' - 'room_id' - 'created_at' - 'updated_at' as details
  into v_room
  from public.rooms r
  left join public.room_details rd on rd.room_id = r.id
  where r.property_id = p_property_id
    and r.lifecycle_status = 'active'
  order by r.updated_at desc, r.created_at desc
  limit 1;

  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_details := coalesce(v_room.details, '{}'::jsonb);
  update public.properties
  set default_room_data = coalesce(default_room_data, '{}'::jsonb)
      || jsonb_build_object(
        'room_details', v_details,
        'chinh_sach', v_room.chinh_sach,
        'link_zalo', v_room.link_zalo,
        'zalo_phone', v_room.zalo_phone
      ),
      google_maps_url = coalesce(v_room.google_maps_url, google_maps_url),
      updated_at = now()
  where id = p_property_id;

  return jsonb_build_object('ok', true, 'property_id', p_property_id, 'room_id', v_room.id);
end;
$function$;

revoke all on function public.sync_property_defaults_from_latest_room_v1(uuid) from public, anon;
grant execute on function public.sync_property_defaults_from_latest_room_v1(uuid) to authenticated, service_role;

create or replace function public.initialize_property_defaults_from_first_room_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = new.room_id;
  if v_room.property_id is null or (
    select count(*) from public.rooms
    where property_id = v_room.property_id and lifecycle_status = 'active'
  ) <> 1 then
    return new;
  end if;

  update public.properties
  set default_room_data = coalesce(default_room_data, '{}'::jsonb)
      || jsonb_build_object(
        'room_details', to_jsonb(new) - 'id' - 'room_id' - 'created_at' - 'updated_at',
        'chinh_sach', v_room.chinh_sach,
        'link_zalo', v_room.link_zalo,
        'zalo_phone', v_room.zalo_phone
      ),
      google_maps_url = coalesce(v_room.google_maps_url, google_maps_url),
      updated_at = now()
  where id = v_room.property_id;
  return new;
end;
$function$;

drop trigger if exists initialize_property_defaults_from_first_room on public.room_details;
create trigger initialize_property_defaults_from_first_room
after insert on public.room_details
for each row execute function public.initialize_property_defaults_from_first_room_v1();

revoke all on function public.initialize_property_defaults_from_first_room_v1() from public, anon, authenticated;

commit;
