begin;

alter table public.rooms
  add column if not exists google_maps_url text;

create or replace function public.can_archive_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    coalesce(public.is_admin_l1(), false)
    or exists (
      select 1 from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and pm.role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.property_owners po
      where po.property_id = p_property_id
        and po.user_id = auth.uid()
    );
$function$;

create or replace function public.set_owner_room_google_maps_v1(
  p_room_id uuid,
  p_google_maps_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_room public.rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(coalesce(p_google_maps_url, '')) > 2000 then
    raise exception 'INVALID_GOOGLE_MAPS_URL' using errcode = '22023';
  end if;
  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  update public.rooms
  set google_maps_url = nullif(btrim(p_google_maps_url), ''), updated_at = now()
  where id = p_room_id
  returning * into v_room;
  return to_jsonb(v_room);
end;
$function$;

-- The Owner Portal archive action is already an explicit confirmation. Allow
-- that operation through the Admin L1 hidden-room edit guard.
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
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if v_room.lifecycle_status = 'archived' then return to_jsonb(v_room); end if;
  if v_room.property_id is null or not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.property_members pm where pm.property_id=v_room.property_id
      and pm.user_id=v_uid and pm.role='owner' and pm.status='active'
  ) or exists (
    select 1 from public.property_owners po where po.property_id=v_room.property_id and po.user_id=v_uid
  ) into v_is_owner;
  perform set_config('app.room_audit_source', case when v_is_owner then 'room_archived_by_owner' else 'room_archived_by_manager' end, true);
  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  update public.rooms set lifecycle_status='archived', publish_status='hidden', is_hidden=true,
    archived_at=now(), archived_by=v_uid, updated_at=now()
  where id=p_room_id returning * into v_room;
  return to_jsonb(v_room);
end;
$function$;

revoke all on function public.can_archive_property(uuid) from public, anon;
revoke all on function public.set_owner_room_google_maps_v1(uuid, text) from public, anon;
revoke all on function public.archive_owner_room_v1(uuid) from public, anon;
grant execute on function public.can_archive_property(uuid) to authenticated, service_role;
grant execute on function public.set_owner_room_google_maps_v1(uuid, text) to authenticated, service_role;
grant execute on function public.archive_owner_room_v1(uuid) to authenticated, service_role;

commit;
