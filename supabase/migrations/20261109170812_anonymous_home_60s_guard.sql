-- Anonymous Home is intentionally the only remaining anon room-list entrypoint.
-- The browser receives an opaque UUID, while the authoritative creation time
-- remains in anon_sessions and is checked inside this SECURITY DEFINER RPC.
do $migration$
declare
  definition text;
  previous text;
begin
  select pg_get_functiondef(
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure
  ) into strict definition;
  definition := replace(definition, chr(13), '');

  previous := definition;
  definition := replace(
    definition,
    E'if effective_role = 0 \nand v_is_vip = false then',
    E'if v_uid is null\nand effective_role = 0\nand v_is_vip = false then'
  );
  if definition = previous then
    raise exception 'Anonymous Home guard: authenticated-bypass patch did not match';
  end if;

  previous := definition;
  definition := replace(
    definition,
    $old$    where s0.id = p_anon_session_id
  ) then$old$,
    $new$    where s0.id = p_anon_session_id
      and (
        s0.created_at > now() - interval '60 seconds'
        or coalesce(s0.unlocked_until, '-infinity'::timestamptz) > now()
      )
  ) then$new$
  );
  if definition = previous then
    raise exception 'Anonymous Home guard: expiry patch did not match';
  end if;

  execute definition;
end;
$migration$;

-- The session registry is server-owned. The service role bypasses RLS and is
-- used only in server code; browser roles cannot mint or inspect sessions.
alter table public.anon_sessions enable row level security;
revoke all on table public.anon_sessions from public, anon, authenticated;
grant all on table public.anon_sessions to service_role;

-- Remove direct browser access to room projections that would bypass the
-- guarded cursor RPC. Authenticated/internal flows retain their current grants.
revoke all on table public.room_full_public from anon;
revoke select on table public.room_details from anon;
revoke select on table public.room_media from anon;
revoke all on table public.rooms_gallery_legacy from anon;
revoke select on table public.room_status_change_logs from anon;
revoke all on table public.property_summary from anon;

revoke execute on function public.start_anon_session(uuid) from public, anon, authenticated;
grant execute on function public.start_anon_session(uuid) to service_role;

revoke execute on function public.fetch_room_detail_full_v1(uuid, integer) from public, anon;
revoke execute on function public.get_room_badges_v1(uuid[]) from public, anon;
revoke execute on function public.resolve_room_google_maps_source_v1(uuid) from public, anon;
revoke execute on function public.fetch_rooms_cursor_full_v3_1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid) from public, anon;
revoke execute on function public.fetch_rooms_cursor_v4(integer,timestamptz,timestamptz,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text) from public, anon;
revoke execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer) from public, anon;
revoke execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[]) from public, anon;

-- These SECURITY DEFINER admin/owner functions already perform role checks,
-- but anon does not need EXECUTE and should not be able to probe them.
revoke execute on function public.fetch_admin_rooms_l1_v2(integer,integer,text,text) from public, anon;
revoke execute on function public.fetch_admin_rooms_l2_v2(integer,integer,text,text) from public, anon;
revoke execute on function public.create_owner_room_v2(uuid,jsonb) from public, anon;
revoke execute on function public.owner_create_room_v1(uuid,jsonb) from public, anon;
revoke execute on function public.hide_room(uuid) from public, anon;
revoke execute on function public.update_room_status(uuid,text) from public, anon;
revoke execute on function public.update_room_status_admin_v1(uuid,text) from public, anon;
revoke execute on function public.find_existing_property_v1(text,text,text) from public, anon;
revoke execute on function public.is_room_public(uuid) from public, anon;

grant execute on function public.fetch_room_detail_full_v1(uuid, integer) to authenticated, service_role;
grant execute on function public.get_room_badges_v1(uuid[]) to authenticated, service_role;
grant execute on function public.resolve_room_google_maps_source_v1(uuid) to authenticated, service_role;
grant execute on function public.fetch_rooms_cursor_full_v3_1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid) to authenticated, service_role;
grant execute on function public.fetch_rooms_cursor_v4(integer,timestamptz,timestamptz,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text) to authenticated, service_role;
grant execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer) to authenticated, service_role;
grant execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[]) to authenticated, service_role;
grant execute on function public.fetch_admin_rooms_l1_v2(integer,integer,text,text) to authenticated, service_role;
grant execute on function public.fetch_admin_rooms_l2_v2(integer,integer,text,text) to authenticated, service_role;
grant execute on function public.create_owner_room_v2(uuid,jsonb) to authenticated, service_role;
grant execute on function public.owner_create_room_v1(uuid,jsonb) to authenticated, service_role;
grant execute on function public.hide_room(uuid) to authenticated, service_role;
grant execute on function public.update_room_status(uuid,text) to authenticated, service_role;
grant execute on function public.update_room_status_admin_v1(uuid,text) to authenticated, service_role;
grant execute on function public.find_existing_property_v1(text,text,text) to authenticated, service_role;
grant execute on function public.is_room_public(uuid) to authenticated, service_role;

-- Keep the single guarded listing RPC callable by anon.
revoke execute on function public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text) from public;
grant execute on function public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text) to anon, authenticated, service_role;
