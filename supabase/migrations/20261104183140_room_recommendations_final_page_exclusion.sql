-- Additive RPC: v1 remains unchanged for the currently deployed website.
-- No table, policy, main-list RPC or room-data changes.
CREATE OR REPLACE FUNCTION public.fetch_room_recommendations_v2(p_search text DEFAULT NULL::text, p_min_price bigint DEFAULT NULL::bigint, p_max_price bigint DEFAULT NULL::bigint, p_districts text[] DEFAULT '{}'::text[], p_room_types text[] DEFAULT '{}'::text[], p_move text DEFAULT NULL::text, p_pet_policies text[] DEFAULT '{}'::text[], p_contract_terms text[] DEFAULT '{}'::text[], p_features text[] DEFAULT '{}'::text[], p_statuses text[] DEFAULT ARRAY['Đang trống'::text, 'Sắp trống'::text], p_badge text DEFAULT NULL::text, p_exclude_ids uuid[] DEFAULT '{}'::uuid[], p_center_lat double precision DEFAULT NULL::double precision, p_center_lng double precision DEFAULT NULL::double precision, p_main_filters jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
  with query_input as (
    select public.anon_home_search_query(left(btrim(p_search),120)) as raw_search
  ), normalized as (
    select raw_search,
      case when raw_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
        then public.norm_room_search_text(regexp_replace(raw_search,'^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*','','i'))
        else nullif(public.norm_room_search_text(raw_search),'') end as s
    from query_input
  ), main_input as (
    select
      coalesce((p_main_filters->>'includeHouse')::boolean,false) as include_house,
      case when coalesce((p_main_filters->>'includeHouse')::boolean,false)
        then nullif(p_main_filters->>'search','')
        else public.anon_home_search_query(nullif(p_main_filters->>'search','')) end as raw_search,
      (p_main_filters->>'minPrice')::bigint as min_price,
      (p_main_filters->>'maxPrice')::bigint as max_price,
      array(select jsonb_array_elements_text(coalesce(p_main_filters->'districts','[]'::jsonb))) as districts,
      array(select jsonb_array_elements_text(coalesce(p_main_filters->'roomTypes','[]'::jsonb))) as room_types,
      nullif(p_main_filters->>'move','') as move,
      array(select jsonb_array_elements_text(coalesce(p_main_filters->'petPolicies','[]'::jsonb))) as pet_policies,
      array(select jsonb_array_elements_text(coalesce(p_main_filters->'contractTerms','[]'::jsonb))) as contract_terms,
      array(select jsonb_array_elements_text(coalesce(p_main_filters->'statuses','[]'::jsonb))) as statuses
  ), main_normalized as (
    select *,
      case when not include_house and raw_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
        then public.norm_room_search_text(regexp_replace(raw_search,'^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*','','i'))
        else public.norm_room_search_text(btrim(raw_search)) end as normalized_search
    from main_input
  ), main_filters as (
    select *,
      case when raw_search is null then null
        when length(normalized_search)<3
          and not(not include_house and normalized_search ~ '^[[:alnum:]/.-]*[0-9][[:alnum:]/.-]*$')
          and raw_search !~* '^\s*(phường|phuong|quận|quan)\s+[0-9]{1,3}\s*$' then null
        else normalized_search end as s
    from main_normalized
  ), candidates as (
    select v.id, v.room_code, v.room_type, v.price, v.status,
      v.address, v.ward, v.district, v.description,
      coalesce(v.updated_at,v.created_at) as updated_at, v.created_at,
      r.house_number, r.owner_id, r.badges, r.available_from,
      p.latitude, p.longitude,
      case when p_center_lat is not null and p_center_lng is not null
        and p.latitude between -90 and 90 and p.longitude between -180 and 180
        and not (p.latitude=0 and p.longitude=0)
        then 6371 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(p.latitude-p_center_lat)/2),2)
          +cos(radians(p_center_lat))*cos(radians(p.latitude))*power(sin(radians(p.longitude-p_center_lng)/2),2))))
        else null end as distance_km,
      (p.latitude between -90 and 90 and p.longitude between -180 and 180
        and not (p.latitude=0 and p.longitude=0)) as valid_gps
    from public.room_full_public v
    join public.rooms r on r.id=v.id
    join public.properties p on p.id=v.property_id
    left join public.room_details rd on rd.room_id=v.id
    cross join normalized q
    cross join main_filters m
    where (p_min_price is null or v.price>=p_min_price)
      and (p_max_price is null or v.price<=p_max_price)
      and (p_min_price is null or p_max_price is null or p_min_price<=p_max_price)
      and not(v.id=any(coalesce(p_exclude_ids,'{}'::uuid[])))
      -- Complement of Home's full result, before LIMIT; never just visited IDs.
      -- Predicates copied from fetch_rooms_cursor_full_v1 at this migration.
      and not coalesce(case when m.include_house then (
(m.min_price is null or v.price >= m.min_price)
      and (m.max_price is null or v.price <= m.max_price)
      and (
        m.districts is null
        or cardinality(m.districts) = 0
        or v.district = any(m.districts)
      )
      and (m.room_types is null or cardinality(m.room_types) = 0 or v.room_type = any(m.room_types))
      and (not ('__amenity:balcony'=any(coalesce(m.statuses,'{}'::text[]))) or coalesce(rd.has_balcony,false))
      and (not ('__amenity:window'=any(coalesce(m.statuses,'{}'::text[]))) or coalesce(rd.has_window,false))
      and (case when m.raw_search ~* '^\s*(phường|phuong)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.ward)=m.s
        when m.raw_search ~* '^\s*(quận|quan)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.district)=m.s else true end)
      and (
        m.statuses is null
        or cardinality(m.statuses) = 0

or (
  (
    not exists (
      select 1 from unnest(m.statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
    )
    or exists (
      select 1 from unnest(m.statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
        and r.badges @> array[substring(badge_filter.value from 9)]::text[]
    )
  )
  and (
    not exists (
      select 1 from unnest(m.statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:' and left(status_filter.value,10)<>'__amenity:'
    )
    or v.status = any(array(
      select status_filter.value from unnest(m.statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:' and left(status_filter.value,10)<>'__amenity:'
    ))
  )
)
      )
      and (
        m.move is null
        or (m.move = 'elevator' and coalesce(rd.has_elevator, false) = true)
        or (m.move = 'stairs' and coalesce(rd.has_stairs, false) = true)
      )
      and (
        m.pet_policies is null
        or cardinality(m.pet_policies) = 0
        or (
          ('cat' = any(m.pet_policies) and coalesce(v.allow_cat, false) = true)
          or ('dog' = any(m.pet_policies) and coalesce(v.allow_dog, false) = true)
          or ('nopet' = any(m.pet_policies) and coalesce(v.no_pet, false) = true)
        )
      )
      and (
        m.contract_terms is null
        or cardinality(m.contract_terms) = 0
        or (
          ('short' = any(m.contract_terms) and coalesce(v.short_term, false) = true)
          or ('long' = any(m.contract_terms) and coalesce(v.long_term, true) = true)
        )
      )
      and (
        m.s is null
        or r.search_address_text like m.s || '%'
        or r.search_address_text like '%' || m.s || '%'
        or r.search_address_text operator(extensions.%) m.s
        or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,true) like '%'||m.s||'%'
      )
      ) else (
(m.min_price is null or v.price >= m.min_price)
      and (m.max_price is null or v.price <= m.max_price)
      and (
        m.districts is null
        or cardinality(m.districts) = 0
        or v.district = any(m.districts)
      )
      and (m.room_types is null or cardinality(m.room_types) = 0 or v.room_type = any(m.room_types))
      and (not ('__amenity:balcony'=any(coalesce(m.statuses,'{}'::text[]))) or coalesce(rd.has_balcony,false))
      and (not ('__amenity:window'=any(coalesce(m.statuses,'{}'::text[]))) or coalesce(rd.has_window,false))
      and (case when m.raw_search ~* '^\s*(phường|phuong)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.ward)=m.s
        when m.raw_search ~* '^\s*(quận|quan)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.district)=m.s else true end)
      and (
        m.statuses is null
        or cardinality(m.statuses) = 0

or (
  (
    not exists (
      select 1 from unnest(m.statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
    )
    or exists (
      select 1 from unnest(m.statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
        and r.badges @> array[substring(badge_filter.value from 9)]::text[]
    )
  )
  and (
    not exists (
      select 1 from unnest(m.statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:' and left(status_filter.value,10)<>'__amenity:'
    )
    or v.status = any(array(
      select status_filter.value from unnest(m.statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:' and left(status_filter.value,10)<>'__amenity:'
    ))
  )
)
      )
      and (
        m.move is null
        or (m.move = 'elevator' and coalesce(rd.has_elevator, false) = true)
        or (m.move = 'stairs' and coalesce(rd.has_stairs, false) = true)
      )
      and (
        m.pet_policies is null
        or cardinality(m.pet_policies) = 0
        or (
          ('cat' = any(m.pet_policies) and coalesce(v.allow_cat, false) = true)
          or ('dog' = any(m.pet_policies) and coalesce(v.allow_dog, false) = true)
          or ('nopet' = any(m.pet_policies) and coalesce(v.no_pet, false) = true)
        )
      )
      and (
        m.contract_terms is null
        or cardinality(m.contract_terms) = 0
        or (
          ('short' = any(m.contract_terms) and coalesce(v.short_term, false) = true)
          or ('long' = any(m.contract_terms) and coalesce(v.long_term, true) = true)
        )
      )
      and (
        m.s is null or case
          when m.raw_search ~* '^\s*(phường|phuong|quận|quan)\s+[0-9]{1,3}\s*$' then true
          when m.raw_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
            or (m.s ~ '^[[:alnum:]/.-]+$' and m.s ~ '[0-9]')
          then public.norm_room_search_text(v.room_code) = m.s
          else (
            r.search_public_address_text like m.s || '%'
            or r.search_public_address_text like '%' || m.s || '%'
            or r.search_public_address_text operator(extensions.%) m.s
            or public.norm_room_search_text(v.room_code) like '%' || m.s || '%'
            or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,false) like '%'||m.s||'%'
          )
        end
      )
      ) end,false)
      and (coalesce(cardinality(p_districts),0)=0 or v.district=any(p_districts))
      and (coalesce(cardinality(p_room_types),0)=0 or v.room_type=any(p_room_types))
      and (coalesce(cardinality(p_statuses),0)=0 or v.status=any(p_statuses))
      and (p_badge is null or coalesce(r.badges,'{}'::text[]) @> array[p_badge])
      and (not('balcony'=any(coalesce(p_features,'{}'::text[]))) or coalesce(rd.has_balcony,false))
      and (not('window'=any(coalesce(p_features,'{}'::text[]))) or coalesce(rd.has_window,false))
      and (p_move is null or (p_move='elevator' and coalesce(rd.has_elevator,false))
        or (p_move='stairs' and coalesce(rd.has_stairs,false)))
      and (coalesce(cardinality(p_pet_policies),0)=0
        or ('cat'=any(p_pet_policies) and coalesce(v.allow_cat,false))
        or ('dog'=any(p_pet_policies) and coalesce(v.allow_dog,false))
        or ('nopet'=any(p_pet_policies) and coalesce(v.no_pet,false)))
      and (coalesce(cardinality(p_contract_terms),0)=0
        or ('short'=any(p_contract_terms) and coalesce(v.short_term,false))
        or ('long'=any(p_contract_terms) and coalesce(v.long_term,true)))
      and ((p_center_lat is null and p_center_lng is null)
        or (p_center_lat between -90 and 90 and p_center_lng between -180 and 180))
      and (q.s is null or case
        when q.raw_search ~* '^\s*(phường|phuong)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.ward)=q.s
        when q.raw_search ~* '^\s*(quận|quan)\s+[0-9]{1,3}\s*$' then public.norm_room_search_text(v.district)=q.s
        when q.raw_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
          or (q.s ~ '^[[:alnum:]/.-]+$' and q.s ~ '[0-9]') then public.norm_room_search_text(v.room_code)=q.s
        else (r.search_public_address_text like q.s||'%'
          or r.search_public_address_text like '%'||q.s||'%'
          or r.search_public_address_text operator(extensions.%) q.s
          or public.norm_room_search_text(v.room_code) like '%'||q.s||'%'
          or public.room_content_search_document(r.house_number,r.description,rd.other_amenities,false) like '%'||q.s||'%')
        end)
  ), selected as materialized (
    select * from candidates
    where p_center_lat is null
      or (valid_gps and distance_km<=3)
      or (not coalesce(valid_gps,false) and coalesce(cardinality(p_districts),0)>0)
    order by updated_at desc nulls last,id desc
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'room_code',s.room_code,'room_type',s.room_type,'price',s.price,'status',s.status,
    'house_number',public.public_house_number_v1(s.house_number),
    'address',s.address,'ward',s.ward,'district',s.district,'description',s.description,
    'updated_at',s.updated_at,'created_at',s.created_at,'available_from',s.available_from,
    'badges',coalesce(s.badges,'{}'::text[]),'distance_km',s.distance_km,
    'image_urls',coalesce(media.images[1:3],'{}'::text[]),'image_count',coalesce(media.image_count,0),
    'thumb_url',media.images[1],'video_url',media.video_url,'has_video',coalesce(media.has_video,false),
    'creator_admin_phone',au.phone,'creator_admin_name',au.full_name,
    'room_detail',jsonb_build_object(
      'has_elevator',rd.has_elevator,'has_stairs',rd.has_stairs,'has_balcony',rd.has_balcony,'has_window',rd.has_window,
      'shared_washer',rd.shared_washer,'private_washer',rd.private_washer,'shared_dryer',rd.shared_dryer,'private_dryer',rd.private_dryer,
      'has_parking',rd.has_parking,'has_basement',rd.has_basement,'fingerprint_lock',rd.fingerprint_lock,'free_time',rd.free_time,
      'allow_pet',rd.allow_pet,'allow_cat',rd.allow_cat,'allow_dog',rd.allow_dog,'no_pet',rd.no_pet,
      'short_term',rd.short_term,'long_term',rd.long_term,'other_amenities',rd.other_amenities
    )
  ) order by s.updated_at desc nulls last,s.id desc),'[]'::jsonb)
  from selected s
  left join public.admin_users au on au.user_id=s.owner_id
  left join public.room_details rd on rd.room_id=s.id
  left join lateral (
    select array_agg(rm.url order by rm.is_cover desc nulls last,rm.sort_order nulls last,rm.created_at,rm.id)
        filter(where rm.type='image') as images,
      count(*) filter(where rm.type='image') as image_count,
      bool_or(rm.type='video') as has_video,
      (array_agg(rm.url order by rm.sort_order nulls last,rm.created_at,rm.id) filter(where rm.type='video'))[1] as video_url
    from public.room_media rm where rm.room_id=s.id and nullif(btrim(rm.url),'') is not null
  ) media on true;
$function$;

REVOKE ALL ON FUNCTION public.fetch_room_recommendations_v2(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_room_recommendations_v2(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision,jsonb) TO service_role;
COMMENT ON FUNCTION public.fetch_room_recommendations_v2(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision,jsonb) IS 'At most 20 public eligible rooms outside the full original Home filter result; service-role-only invoker.';
