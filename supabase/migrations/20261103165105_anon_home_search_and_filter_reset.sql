create or replace function public.anon_home_search_query(p_query text)
returns text language plpgsql immutable set search_path = ''
as $query$
declare q text := btrim(coalesce(p_query,''));
begin
  if q ~* '^[0-9]+\s+(tháng|thang)\s+[0-9]+' or q ~ '^(3/2|30/4|2/9|19/5)\s*(,|$)' then return q; end if;
  return btrim(regexp_replace(q, '^(?:(?:số\s*nhà|so\s*nha|số|so)\s*[:.]?\s*)?[0-9]+[[:alpha:]]*(?:\s*[/\-]\s*[0-9]+[[:alpha:]]*)*\s*[,;]?\s+(?=[[:alpha:]])', '', 'i'));
end;
$query$;

-- Keep effective-role authorization, payload redaction, filters and cursors intact.
do $migration$
declare definition text; previous text;
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='fetch_rooms_cursor_full_v1';
 definition := replace(definition,chr(13),'');
 previous := definition;
 definition := replace(definition,replace($old$    where s0.id = p_anon_session_id
      and (
        s0.created_at > now() - interval '60 seconds'
        or coalesce(
          s0.unlocked_until,
          '-infinity'::timestamptz
        ) > now()
      )$old$,chr(13),''),replace($new$    where s0.id = p_anon_session_id$new$,chr(13),''));
 if definition = previous then raise exception 'Anon Home patch 1 did not match'; end if;
 previous := definition;
 definition := replace(definition,replace($old$ if p_search is not null then
  s := public.norm_room_search_text(btrim(p_search));$old$,chr(13),''),replace($new$ if effective_role = 0 then
  p_search := public.anon_home_search_query(p_search);
 end if;
 if p_search is not null then
  s := public.norm_room_search_text(btrim(p_search));
  if effective_role = 0 and p_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$' then
    s := public.norm_room_search_text(regexp_replace(p_search,'^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*','','i'));
  end if;$new$,chr(13),''));
 if definition = previous then raise exception 'Anon Home patch 2 did not match'; end if;
 previous := definition;
 definition := replace(definition,replace($old$if length(s) < 3 and p_search$old$,chr(13),''),replace($new$if length(s) < 3 and not (effective_role = 0 and s ~ '^[[:alnum:]/.-]*[0-9][[:alnum:]/.-]*$') and p_search$new$,chr(13),''));
 if definition = previous then raise exception 'Anon Home patch 3 did not match'; end if;
 previous := definition;
 definition := replace(definition,replace($old$      and (
        s is null
        or r.search_public_address_text like s || '%'
        or r.search_public_address_text like '%' || s || '%'
        or r.search_public_address_text operator(extensions.%) s
        or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,false) like '%'||s||'%'
      )$old$,chr(13),''),replace($new$      and (
        s is null or case
          when p_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
            or (s ~ '^[[:alnum:]/.-]+$' and s ~ '[0-9]')
          then public.norm_room_search_text(v.room_code) = s
          else (
            r.search_public_address_text like s || '%'
            or r.search_public_address_text like '%' || s || '%'
            or r.search_public_address_text operator(extensions.%) s
            or public.norm_room_search_text(v.room_code) like '%' || s || '%'
            or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,false) like '%'||s||'%'
          )
        end
      )$new$,chr(13),''));
 if definition = previous then raise exception 'Anon Home patch 4 did not match'; end if;
 previous := definition;
 definition := replace(definition,replace($old$public.room_home_search_score(r.house_number, v.address, v.ward, v.district, r.description, rd.other_amenities, s, false)$old$,chr(13),''),replace($new$greatest(public.room_home_search_score(r.house_number, v.address, v.ward, v.district, r.description, rd.other_amenities, s, false), case when public.norm_room_search_text(v.room_code) = s then 13000 else 0 end)$new$,chr(13),''));
 if definition = previous then raise exception 'Anon Home patch 5 did not match'; end if;
 execute definition;
end;
$migration$;

