alter table public.room_details
  add column if not exists no_live_in_landlord boolean not null default false,
  add column if not exists accepts_foreign_tenants boolean not null default false;

-- Reuse the current RPCs so their authorization, pagination and grants stay in effect.
do $migration$
declare
  definition text;
  original text;
  target regprocedure;
  amenity text;
  predicate text;
begin
  target := 'public.save_room_details_v1(uuid,jsonb)'::regprocedure;
  definition := pg_get_functiondef(target);
  original := definition;
  definition := replace(definition, $anchor$  if p_payload ? 'has_balcony' then$anchor$, $patch$
  if p_payload ? 'no_live_in_landlord' or p_payload ? 'accepts_foreign_tenants' then
    update public.room_details
    set no_live_in_landlord = case when p_payload ? 'no_live_in_landlord'
          then coalesce((p_payload->>'no_live_in_landlord')::boolean, false) else no_live_in_landlord end,
        accepts_foreign_tenants = case when p_payload ? 'accepts_foreign_tenants'
          then coalesce((p_payload->>'accepts_foreign_tenants')::boolean, false) else accepts_foreign_tenants end
    where room_id = p_room_id;
  end if;
  if p_payload ? 'has_balcony' then$patch$);
  if definition = original then raise exception 'Missing amenity save anchor in %', target; end if;
  execute definition;

  target := 'public.approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb)'::regprocedure;
  definition := pg_get_functiondef(target);
  original := definition;
  definition := replace(definition, $anchor$'has_balcony','has_window'$anchor$,
    $patch$'has_balcony','has_window','no_live_in_landlord','accepts_foreign_tenants'$patch$);
  if definition = original then raise exception 'Missing approval anchor in %', target; end if;
  execute definition;

  foreach target in array array[
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure,
    'public.fetch_room_recommendations_v1(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision)'::regprocedure,
    'public.fetch_room_recommendations_v2(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    original := definition;
    -- Every branch that tests the window flag must also test both tenant flags.
    foreach amenity in array array['no_live_in_landlord','accepts_foreign_tenants'] loop
      for predicate in
        select distinct match[1]
        from regexp_matches(original, $pattern$and \(not[^\r\n]+coalesce\(rd\.has_window,false\)\)$pattern$, 'g') as match
      loop
        definition := replace(definition, predicate, predicate || E'\n      ' ||
          replace(replace(predicate, 'has_window', amenity), 'window', amenity));
      end loop;
    end loop;
    if definition = original then raise exception 'Missing filter anchor in %', target; end if;
    definition := replace(definition, $anchor$'has_window',rd.has_window,$anchor$,
      $patch$'has_window',rd.has_window,'no_live_in_landlord',rd.no_live_in_landlord,'accepts_foreign_tenants',rd.accepts_foreign_tenants,$patch$);
    execute definition;
  end loop;

  target := 'public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[])'::regprocedure;
  definition := pg_get_functiondef(target);
  original := definition;
  definition := replace(definition, 'cardinality(p_statuses) = 0',
    $patch$cardinality(array_remove(array_remove(p_statuses, '__amenity:no_live_in_landlord'), '__amenity:accepts_foreign_tenants')) = 0$patch$);
  if definition = original then raise exception 'Missing default status anchor in %', target; end if;
  original := definition;
  definition := replace(definition, 'and (p_room_types is null', $patch$
      and (not ('__amenity:no_live_in_landlord' = any(coalesce(p_statuses, '{}'::text[])))
        or exists (select 1 from public.room_details rd where rd.room_id = v.id and rd.no_live_in_landlord))
      and (not ('__amenity:accepts_foreign_tenants' = any(coalesce(p_statuses, '{}'::text[])))
        or exists (select 1 from public.room_details rd where rd.room_id = v.id and rd.accepts_foreign_tenants))
      and (p_room_types is null$patch$);
  if definition = original then raise exception 'Missing map filter anchor in %', target; end if;
  execute definition;
end $migration$;
