begin;

create or replace function public.sync_admin_room_ward_to_property_v1(
  p_room_id uuid,
  p_ward text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin_level integer;
  v_property_id uuid;
  v_ward text := nullif(btrim(p_ward), '');
  v_room_count integer := 0;
begin
  select au.level
  into v_admin_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if v_uid is null or coalesce(v_admin_level, 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_room_id is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if length(coalesce(v_ward, '')) > 120 then
    raise exception 'INVALID_WARD_LENGTH' using errcode = '22023';
  end if;

  select r.property_id
  into v_property_id
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_property_id is null then
    update public.rooms r
    set ward = v_ward, updated_at = now()
    where r.id = p_room_id
      and nullif(btrim(r.ward), '') is distinct from v_ward;
    get diagnostics v_room_count = row_count;
  else
    perform 1
    from public.properties p
    where p.id = v_property_id
    for update;

    if not found then
      raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
    end if;

    update public.properties p
    set ward = v_ward, updated_at = now()
    where p.id = v_property_id
      and nullif(btrim(p.ward), '') is distinct from v_ward;

    update public.rooms r
    set ward = v_ward, updated_at = now()
    where r.property_id = v_property_id
      and nullif(btrim(r.ward), '') is distinct from v_ward;
    get diagnostics v_room_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'property_id', v_property_id,
    'ward', v_ward,
    'rooms_updated', v_room_count
  );
end;
$function$;

revoke all on function public.sync_admin_room_ward_to_property_v1(uuid, text)
from public, anon;
grant execute on function public.sync_admin_room_ward_to_property_v1(uuid, text)
to authenticated, service_role;

commit;
