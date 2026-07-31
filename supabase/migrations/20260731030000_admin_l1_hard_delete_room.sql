begin;

create or replace function public.admin_l1_delete_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room public.rooms%rowtype;
begin
  if not coalesce(public.is_admin_l1(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- These import references are intentionally retained as history, but must no
  -- longer point at a room that is about to be permanently removed.
  update public.pending_room_versions
  set matched_room_id = case when matched_room_id = p_room_id then null else matched_room_id end,
      approved_room_id = case when approved_room_id = p_room_id then null else approved_room_id end
  where matched_room_id = p_room_id or approved_room_id = p_room_id;

  update public.zalo_import_images
  set copied_room_id = null
  where copied_room_id = p_room_id;

  -- Payments cascade from revenues. Contract tenants and contract logs cascade
  -- from contracts. Room details, media and status/audit logs cascade from rooms.
  delete from public.room_monthly_revenues where room_id = p_room_id;
  delete from public.rental_contracts where room_id = p_room_id;
  delete from public.rooms_gallery_legacy where id = p_room_id;
  delete from public.rooms where id = p_room_id;

  return jsonb_build_object(
    'id', p_room_id,
    'deleted', true
  );
end;
$function$;

revoke all on function public.admin_l1_delete_room(uuid)
from public, anon;

grant execute on function public.admin_l1_delete_room(uuid)
to authenticated, service_role;

commit;
