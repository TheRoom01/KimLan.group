do $$
declare
  v_oid oid;
  v_definition text;
  v_original text;
  v_public_filter text := $filter$
      and (
        s is null
        or not exists (
          select 1
          from unnest((regexp_split_to_array(s, '[\s\-]+'))[1:6]) as tok
          where tok <> ''
            and not (
              public.norm_room_search_text(concat_ws(
                ' ',
                coalesce(v.address, ''),
                coalesce(v.ward, ''),
                coalesce(v.district, '')
              )) like ('%' || tok || '%')
            )
        )
      )
$filter$;
  v_admin_filter text := $filter$
      and (
        s is null
        or not exists (
          select 1
          from unnest((regexp_split_to_array(s, '[\s\-]+'))[1:6]) as tok
          where tok <> ''
            and not (
              public.norm_room_search_text(concat_ws(
                ' ',
                coalesce(v.house_number, ''),
                coalesce(v.address, ''),
                coalesce(v.ward, ''),
                coalesce(v.district, '')
              )) like ('%' || tok || '%')
            )
        )
      )
$filter$;
  v_fuzzy_filter text := $filter$
      and (s is null or r.search_text operator(extensions.%) s)
$filter$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fetch_rooms_cursor_full_v1';

  if v_oid is null then
    raise exception 'fetch_rooms_cursor_full_v1 not found';
  end if;

  v_definition := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_original := v_definition;
  v_definition := replace(v_definition, v_public_filter, v_fuzzy_filter);
  v_definition := replace(v_definition, v_admin_filter, v_fuzzy_filter);

  if v_definition = v_original then
    raise exception 'No Home search filter was replaced';
  end if;
  if position(v_public_filter in v_definition) > 0 or position(v_admin_filter in v_definition) > 0 then
    raise exception 'Some Home search filters were not replaced';
  end if;

  execute v_definition;
end;
$$;
