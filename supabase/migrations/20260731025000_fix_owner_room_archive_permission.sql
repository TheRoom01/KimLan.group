begin;

create or replace function public.archive_owner_room_v1(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_is_owner boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_room.lifecycle_status = 'archived' then
    return to_jsonb(v_room);
  end if;

  -- Room mutations are available to active owners and managers. Property
  -- ownership release remains owner-only and uses can_archive_property.
  if v_room.property_id is null or not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select
    exists (
      select 1 from public.property_members pm
      where pm.property_id = v_room.property_id
        and pm.user_id = v_uid
        and pm.role = 'owner'
        and pm.status = 'active'
    ) or exists (
      select 1 from public.property_owners po
      where po.property_id = v_room.property_id
        and po.owner_id = v_uid
    )
  into v_is_owner;

  perform set_config(
    'app.room_audit_source',
    case when v_is_owner then 'room_archived_by_owner' else 'room_archived_by_manager' end,
    true
  );

  update public.rooms
  set lifecycle_status = 'archived',
      publish_status = 'hidden',
      is_hidden = true,
      archived_at = now(),
      archived_by = v_uid,
      updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return to_jsonb(v_room);
end;
$function$;

revoke all on function public.archive_owner_room_v1(uuid) from public, anon;
grant execute on function public.archive_owner_room_v1(uuid) to authenticated, service_role;

commit;
