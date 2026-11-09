-- MANUAL ROLLBACK ONLY for 20261109170812_anonymous_home_60s_guard.sql.
-- This restores the previous public grants and intentionally removes the
-- 60-second database guard. Run only if the application deployment is rolled
-- back at the same time.
do $rollback$
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
    E'if v_uid is null\nand effective_role = 0\nand v_is_vip = false then',
    E'if effective_role = 0 \nand v_is_vip = false then'
  );
  if definition = previous then raise exception 'Rollback role guard did not match'; end if;

  previous := definition;
  definition := replace(
    definition,
    $old$    where s0.id = p_anon_session_id
      and (
        s0.created_at > now() - interval '60 seconds'
        or coalesce(s0.unlocked_until, '-infinity'::timestamptz) > now()
      )
  ) then$old$,
    $new$    where s0.id = p_anon_session_id
  ) then$new$
  );
  if definition = previous then raise exception 'Rollback expiry guard did not match'; end if;
  execute definition;
end;
$rollback$;

alter table public.anon_sessions disable row level security;
grant all on table public.anon_sessions to anon, authenticated, service_role;
grant all on table public.room_full_public, public.rooms_gallery_legacy to anon;
grant select on table public.room_details, public.room_media to anon;
grant select on table public.room_status_change_logs to anon;
grant all on table public.property_summary to anon;

grant execute on function public.start_anon_session(uuid) to public, anon, authenticated, service_role;
grant execute on function public.fetch_room_detail_full_v1(uuid, integer) to public, anon;
grant execute on function public.get_room_badges_v1(uuid[]) to public, anon;
grant execute on function public.resolve_room_google_maps_source_v1(uuid) to public, anon;
grant execute on function public.fetch_rooms_cursor_full_v3_1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid) to public, anon;
grant execute on function public.fetch_rooms_cursor_v4(integer,timestamptz,timestamptz,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text) to public, anon;
grant execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer) to public, anon;
grant execute on function public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[]) to public, anon;
grant execute on function public.fetch_admin_rooms_l1_v2(integer,integer,text,text) to public, anon;
grant execute on function public.fetch_admin_rooms_l2_v2(integer,integer,text,text) to public, anon;
grant execute on function public.create_owner_room_v2(uuid,jsonb) to public, anon;
grant execute on function public.owner_create_room_v1(uuid,jsonb) to public, anon;
grant execute on function public.hide_room(uuid) to public, anon;
grant execute on function public.update_room_status(uuid,text) to public, anon;
grant execute on function public.update_room_status_admin_v1(uuid,text) to public, anon;
grant execute on function public.find_existing_property_v1(text,text,text) to public, anon;
grant execute on function public.is_room_public(uuid) to public, anon;
