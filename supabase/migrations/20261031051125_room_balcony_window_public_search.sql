-- Add room amenities without changing existing role/owner authorization.
alter table public.room_details add column if not exists has_balcony boolean not null default false;
alter table public.room_details add column if not exists has_window boolean not null default false;

-- The existing save delegates the L1/L2/owner authorization check before UPDATE.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.save_room_details_v1(uuid,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,chr(13),'');
  if position('has_balcony' in definition)=0 then
    definition:=replace(definition,'  if p_payload ? ''free_time'' then',
      $patch$  if p_payload ? 'has_balcony' then
    update public.room_details set has_balcony=coalesce((p_payload->>'has_balcony')::boolean,false) where room_id=p_room_id;
  end if;
  if p_payload ? 'has_window' then
    update public.room_details set has_window=coalesce((p_payload->>'has_window')::boolean,false) where room_id=p_room_id;
  end if;
  if p_payload ? 'free_time' then$patch$);
    if position('has_balcony' in definition)=0 then raise exception 'SAVE_DETAILS_DEFINITION_CHANGED'; end if;
    execute definition;
  end if;
end $migration$;

alter table public.rooms add column if not exists search_public_address_text text
generated always as (public.room_address_search_document(null,address,ward,district)) stored;
create index if not exists rooms_public_address_search_trgm_idx on public.rooms using gin(search_public_address_text extensions.gin_trgm_ops);

create or replace function public.room_content_search_document(p_house text,p_description text,p_amenities text,p_include_house boolean)
returns text language sql immutable security invoker set search_path='' as $function$
  select case when p_include_house then public.norm_room_search_text(concat_ws(' ',p_description,p_amenities))
    else coalesce((select string_agg(token,' ' order by ordinal)
      from regexp_split_to_table(public.norm_room_search_text(concat_ws(' ',p_description,p_amenities)),'\s+') with ordinality as words(token,ordinal)
      where public.norm_room_search_text(p_house)='' or
        regexp_replace(token,'^[^[:alnum:]]+|[^[:alnum:]]+$','','g')<>public.norm_room_search_text(p_house)), '') end;
$function$;

create or replace function public.room_home_search_score(p_house text,p_address text,p_ward text,p_district text,p_description text,p_amenities text,p_query text,p_include_house boolean)
returns integer language sql immutable security invoker set search_path='' as $function$
  select greatest(public.room_address_search_score(case when p_include_house then p_house else null end,p_address,p_ward,p_district,null,p_query),
    case when public.room_content_search_document(p_house,p_description,p_amenities,p_include_house) like '%'||p_query||'%' then 9000 else 0 end);
$function$;

-- Patch the existing three role branches; retain all private-field, visibility,
-- VIP/session, limit, sort, count and cursor logic. Cursor scores use the same doc.
do $migration$
declare definition text; segment text; branch integer; first_pos integer; next_pos integer; view_name text; old_score text;
begin
  select pg_get_functiondef('public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamptz,timestamptz,uuid,uuid,text)'::regprocedure) into definition;
  definition:=replace(definition,chr(13),'');
  old_score:='public.room_address_search_score(v.house_number, v.address, v.ward, v.district, null, s)';
  if (length(definition)-length(replace(definition,old_score,'')))/length(old_score)<>6 then raise exception 'HOME_SEARCH_DEFINITION_CHANGED'; end if;
  definition:=replace(definition,'if length(s) < 3 then', $patch$if length(s) < 3 and p_search !~* '^\s*(phường|phuong|quận|quan)\s+[0-9]{1,3}\s*$' then$patch$);
  definition:=replace(definition,$old$where left(status_filter.value, 8) <> '__badge:'$old$,
    $new$where left(status_filter.value, 8) <> '__badge:' and left(status_filter.value,10)<>'__amenity:'$new$);
  for branch in 0..2 loop
    first_pos:=strpos(definition,' if effective_role = '||branch||' then');
    next_pos:=case when branch<2 then strpos(definition,' if effective_role = '||(branch+1)||' then') else length(definition)+1 end;
    if first_pos=0 or next_pos<=first_pos then raise exception 'HOME_ROLE_BRANCH_CHANGED'; end if;
    segment:=substring(definition from first_pos for next_pos-first_pos);
    view_name:=case branch when 0 then 'room_full_public' when 1 then 'room_full_admin_l1' else 'room_full_admin_l2' end;
    segment:=replace(segment,'from public.'||view_name||E' v\n    where v.id = p_cursor;',
      'from public.'||view_name||E' v\n    join public.rooms r on r.id=v.id\n    left join public.room_details rd on rd.room_id=v.id\n    where v.id = p_cursor;');
    segment:=replace(segment,old_score,'public.room_home_search_score(r.house_number, v.address, v.ward, v.district, r.description, rd.other_amenities, s, '||case when branch=0 then 'false' else 'true' end||')');
    if branch=0 then segment:=replace(segment,'r.search_address_text','r.search_public_address_text'); end if;
    segment:=replace(segment,'and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))',
      $patch$and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))
      and (not ('__amenity:balcony'=any(coalesce(p_statuses,'{}'::text[]))) or coalesce(rd.has_balcony,false))
      and (not ('__amenity:window'=any(coalesce(p_statuses,'{}'::text[]))) or coalesce(rd.has_window,false))
      and (case when p_search ~* '^\s*(phường|phuong)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.ward)=s
        when p_search ~* '^\s*(quận|quan)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.district)=s else true end)$patch$);
    segment:=replace(segment,'or r.'||case when branch=0 then 'search_public_address_text' else 'search_address_text' end||' operator(extensions.%) s',
      'or r.'||case when branch=0 then 'search_public_address_text' else 'search_address_text' end||' operator(extensions.%) s'||E'\n        or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,'||case when branch=0 then 'false' else 'true' end||') like ''%''||s||''%''');
    definition:=overlay(definition placing segment from first_pos for next_pos-first_pos);
  end loop;
  execute definition;
end $migration$;

-- Manual UPDATE approval uses an explicit detail-field allowlist.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb)'::regprocedure) into definition;
 if position('has_balcony' in definition)=0 then
   definition:=replace(definition,'''has_elevator'',''has_stairs''','''has_elevator'',''has_stairs'',''has_balcony'',''has_window''');
   if position('has_balcony' in definition)=0 then raise exception 'IMPORT_APPROVAL_ALLOWLIST_CHANGED'; end if;
   execute definition;
 end if;
end $migration$;
notify pgrst,'reload schema';
