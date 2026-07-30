begin;

create or replace function public.finalize_owner_room_creation_v1(
  p_room_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room public.rooms%rowtype;
  v_publish_status text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_room.property_id is null or not public.can_manage_property(v_room.property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if nullif(btrim(p_status), '') is null or length(btrim(p_status)) > 100 then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select case
    when p.approval_status = 'approved'
      and coalesce(p.lifecycle_status, 'active') = 'active'
      then 'published'
    else 'draft'
  end
  into v_publish_status
  from public.properties p
  where p.id = v_room.property_id;

  update public.rooms
  set
    status = btrim(p_status),
    lifecycle_status = 'active',
    publish_status = coalesce(v_publish_status, 'draft'),
    is_hidden = case when v_publish_status = 'published' then false else is_hidden end,
    updated_at = now()
  where id = p_room_id
  returning * into v_room;

  return jsonb_build_object(
    'ok', true,
    'room', to_jsonb(v_room),
    'published', v_room.publish_status = 'published'
  );
end;
$function$;

revoke all on function public.finalize_owner_room_creation_v1(uuid, text) from public, anon;
grant execute on function public.finalize_owner_room_creation_v1(uuid, text) to authenticated, service_role;

commit;
