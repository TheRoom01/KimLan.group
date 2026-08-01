do $$
declare
  v_oid oid;
  v_definition text;
  v_original text;
  v_cursor_fallback text := E'\n        300\n      )::int';
  v_cursor_score text := E'\n        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)\n      )::int';
  v_row_fallback text := E'\n          300\n        )\n      end::int as search_score';
  v_row_score text := E'\n          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)\n        )\n      end::int as search_score';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fetch_rooms_cursor_full_v1';

  if v_oid is null then raise exception 'fetch_rooms_cursor_full_v1 not found'; end if;

  v_definition := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_original := v_definition;
  v_definition := replace(v_definition, v_cursor_fallback, v_cursor_score);
  v_definition := replace(v_definition, v_row_fallback, v_row_score);

  if v_definition = v_original then raise exception 'No Home fallback score was replaced'; end if;
  if position(v_cursor_fallback in v_definition) > 0 or position(v_row_fallback in v_definition) > 0 then
    raise exception 'Some Home fallback scores were not replaced';
  end if;

  execute v_definition;
end;
$$;
