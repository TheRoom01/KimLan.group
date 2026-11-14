-- Preserve the deployed search, access and pagination logic.
do $migration$
declare
  definition text;
  updated text;
  image_query text := $pattern$(and rm[.]type = 'image'[[:space:]]+and coalesce[(]rm[.]url, ''[)] <> '')[[:space:]]+order by rm[.]created_at asc$pattern$;
  cover_order text := 'rm.sort_order asc nulls last, rm.created_at asc nulls last, rm.id asc';
begin
  definition := pg_get_functiondef(
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure
  );
  if (select count(*) from regexp_matches(definition, image_query, 'g')) <> 6 then
    raise exception 'Unexpected Home image query definitions';
  end if;
  updated := regexp_replace(definition, image_query,
    $replacement$and rm.type = 'image' and nullif(btrim(rm.url), '') is not null order by $replacement$ || cover_order, 'g');
  -- Order the aggregate explicitly as well as the limited subquery.
  updated := regexp_replace(updated,
    $pattern$jsonb_agg[(]u[)]([[:space:]]*, '\[\]'::jsonb[)][[:space:]]+from [(][[:space:]]+select rm[.]url as u)$pattern$,
    $replacement$jsonb_agg(u order by sort_order asc nulls last, created_at asc nulls last, id asc)\1, rm.sort_order, rm.created_at, rm.id$replacement$, 'g');
  execute updated;

  definition := pg_get_functiondef(
    'public.fetch_room_recommendations_v2(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision,jsonb)'::regprocedure
  );
  updated := replace(definition,
    'rm.is_cover desc nulls last,rm.sort_order nulls last,rm.created_at,rm.id', cover_order);
  if updated = definition then
    raise exception 'Unexpected recommendations image ordering';
  end if;
  execute updated;

  definition := pg_get_functiondef(
    'public.search_rooms_in_map_v1(double precision,double precision,double precision,double precision,text,bigint,bigint,text[],text[],double precision,double precision,double precision,integer,text[])'::regprocedure
  );
  updated := regexp_replace(definition, 'rm[.]is_cover desc nulls last,[[:space:]]*', '');
  if updated = definition then
    raise exception 'Unexpected map image ordering';
  end if;
  execute updated;

  definition := pg_get_functiondef('public.get_owner_property_room_candidates_v1(uuid)'::regprocedure);
  updated := replace(definition, 'rm.is_cover desc nulls last, rm.sort_order, rm.created_at', cover_order);
  if updated = definition then
    raise exception 'Unexpected owner candidate image ordering';
  end if;
  execute replace(updated, 'rm.type = ''image'' order by', 'rm.type = ''image'' and nullif(btrim(rm.url), '''') is not null order by');
end;
$migration$;
