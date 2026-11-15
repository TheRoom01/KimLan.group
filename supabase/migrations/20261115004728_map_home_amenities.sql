-- Extend the existing map RPC filters while keeping its signature and access grants.
do $migration$
declare
  target regprocedure := 'public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[])'::regprocedure;
  definition text := pg_get_functiondef(target);
  status_anchor text := $sql$cardinality(array_remove(array_remove(p_statuses, '__amenity:no_live_in_landlord'), '__amenity:accepts_foreign_tenants')) = 0$sql$;
  filter_anchor text := 'and (p_room_types is null';
begin
  if strpos(definition, status_anchor) = 0 or strpos(definition, filter_anchor) = 0 then
    raise exception 'Missing map amenity filter anchor in %', target;
  end if;

  definition := replace(definition, status_anchor, $sql$
        not exists (
          select 1 from unnest(p_statuses) as filters(token)
          where not starts_with(token, '__amenity:')
        )$sql$);

  definition := replace(definition, filter_anchor, $sql$
      and (
        not (coalesce(p_statuses, '{}'::text[]) && array['__amenity:balcony','__amenity:window','__amenity:elevator','__amenity:stairs'])
        or exists (
          select 1 from public.room_details rd where rd.room_id = v.id
            and (not ('__amenity:balcony' = any(p_statuses)) or rd.has_balcony)
            and (not ('__amenity:window' = any(p_statuses)) or rd.has_window)
            and (not ('__amenity:elevator' = any(p_statuses)) or rd.has_elevator)
            and (not ('__amenity:stairs' = any(p_statuses)) or rd.has_stairs)
        )
      )
      and (
        not (coalesce(p_statuses, '{}'::text[]) && array['__amenity:cat','__amenity:dog','__amenity:nopet'])
        or ('__amenity:cat' = any(p_statuses) and coalesce(v.allow_cat, false))
        or ('__amenity:dog' = any(p_statuses) and coalesce(v.allow_dog, false))
        or ('__amenity:nopet' = any(p_statuses) and coalesce(v.no_pet, false))
      )
      and (
        not (coalesce(p_statuses, '{}'::text[]) && array['__amenity:short','__amenity:long'])
        or ('__amenity:short' = any(p_statuses) and coalesce(v.short_term, false))
        or ('__amenity:long' = any(p_statuses) and coalesce(v.long_term, true))
      )
      and (p_room_types is null$sql$);
  execute definition;
end $migration$;
