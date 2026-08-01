begin;

create or replace function public.delete_owner_room_permanently_v1(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room public.rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.pending_room_versions
  set matched_room_id = case when matched_room_id = p_room_id then null else matched_room_id end,
      approved_room_id = case when approved_room_id = p_room_id then null else approved_room_id end
  where matched_room_id = p_room_id or approved_room_id = p_room_id;

  update public.zalo_import_images
  set copied_room_id = null
  where copied_room_id = p_room_id;

  delete from public.room_monthly_revenues where room_id = p_room_id;
  delete from public.rental_contracts where room_id = p_room_id;
  delete from public.rooms_gallery_legacy where id = p_room_id;
  delete from public.rooms where id = p_room_id;

  return jsonb_build_object('id', p_room_id, 'deleted', true);
end;
$function$;

revoke all on function public.delete_owner_room_permanently_v1(uuid)
from public, anon;

grant execute on function public.delete_owner_room_permanently_v1(uuid)
to authenticated, service_role;

comment on function public.delete_owner_room_permanently_v1(uuid)
is 'Permanently deletes a room and its dependent operational history after can_manage_room authorization.';

commit;
