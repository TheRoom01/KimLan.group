begin;

do $test$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure
  ) into strict definition;

  if definition not like '%s0.created_at > now() - interval ''60 seconds''%' then
    raise exception 'fetch_rooms_cursor_full_v1 has no 60-second database guard';
  end if;
  if definition not like '%if v_uid is null%effective_role = 0%v_is_vip = false then%' then
    raise exception 'authenticated users are not explicitly exempt from the anonymous guard';
  end if;
  if has_table_privilege('anon', 'public.anon_sessions', 'SELECT')
     or has_table_privilege('anon', 'public.anon_sessions', 'INSERT') then
    raise exception 'anon can inspect or mint server-managed sessions';
  end if;
  if has_table_privilege('anon', 'public.room_full_public', 'SELECT')
     or has_table_privilege('anon', 'public.room_details', 'SELECT')
     or has_table_privilege('anon', 'public.room_media', 'SELECT')
     or has_table_privilege('anon', 'public.rooms_gallery_legacy', 'SELECT')
     or has_table_privilege('anon', 'public.room_status_change_logs', 'SELECT')
     or has_table_privilege('anon', 'public.property_summary', 'SELECT') then
    raise exception 'anon still has a direct table/view bypass';
  end if;
  if not has_function_privilege('anon',
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)',
    'EXECUTE') then
    raise exception 'guarded anonymous list RPC is unavailable';
  end if;
  if has_function_privilege('anon', 'public.fetch_room_detail_full_v1(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fetch_rooms_cursor_v4(integer,timestamptz,timestamptz,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.resolve_room_google_maps_source_v1(uuid)', 'EXECUTE') then
    raise exception 'anon still has an alternate room-data RPC bypass';
  end if;
end;
$test$;

select 'Anonymous Home database guard and privilege audit passed' as result;
rollback;
