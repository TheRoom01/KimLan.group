-- Include visibility state only in the existing Admin L1 Home payload.
do $migration$
declare
  definition text;
  original text;
begin
  select pg_get_functiondef(oid) into strict definition
  from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'fetch_rooms_cursor_full_v1';

  definition := replace(definition, chr(13), '');
  original := definition;
  definition := replace(definition, $old$        'available_from', r.available_from
      ) as row_json
    from public.room_full_admin_l1 v$old$, $new$        'available_from', r.available_from,
        'is_hidden', coalesce(r.is_hidden, false)
      ) as row_json
    from public.room_full_admin_l1 v$new$);
  if definition = original then raise exception 'Admin L1 Home projection did not match'; end if;

  execute definition;
end;
$migration$;
