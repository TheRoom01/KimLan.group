do $migration$
declare
  v_definition text;
  v_needle text := '''updated_at'', v.updated_at,';
  v_insert text := '''room_detail'', to_jsonb(rd),';
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fetch_rooms_cursor_full_v1';

  if v_definition is null then
    raise exception 'fetch_rooms_cursor_full_v1 not found';
  end if;

  if position(v_insert in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'Expected JSON builder anchor not found';
    end if;

    v_definition := replace(
      v_definition,
      v_needle,
      v_insert || E'\n          ' || v_needle
    );
    execute v_definition;
  end if;
end;
$migration$;
