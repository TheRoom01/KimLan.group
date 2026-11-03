-- Prepared for review only. Do not apply to the shared production DB without approval.
-- Public recommendations use the same public-room eligibility and text helpers as Home.
-- INVOKER + service_role-only EXECUTE: browsers cannot invoke a privileged room query.
create or replace function public.fetch_room_recommendations_v1(
  p_search text default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_districts text[] default '{}',
  p_room_types text[] default '{}',
  p_move text default null,
  p_pet_policies text[] default '{}',
  p_contract_terms text[] default '{}',
  p_features text[] default '{}',
  p_statuses text[] default array['Đang trống','Sắp trống'],
  p_badge text default null,
  p_exclude_ids uuid[] default '{}',
  p_center_lat double precision default null,
  p_center_lng double precision default null
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $function$
  with query_input as (
    select public.anon_home_search_query(left(btrim(p_search),120)) as raw_search
  ), normalized as (
    select raw_search,
      case when raw_search ~* '^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*\S+$'
        then public.norm_room_search_text(regexp_replace(raw_search,'^(mã\s*phòng|ma\s*phong|phòng|phong)\s*[:.]?\s*','','i'))
        else nullif(public.norm_room_search_text(raw_search),'') end as s
    from query_input
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
    where (p_min_price is null or v.price>=p_min_price)
      and (p_max_price is null or v.price<=p_max_price)
      and (p_min_price is null or p_max_price is null or p_min_price<=p_max_price)
      and not(v.id=any(coalesce(p_exclude_ids,'{}'::uuid[])))
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
    limit 10
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

revoke all on function public.fetch_room_recommendations_v1(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision) from public,anon,authenticated;
grant execute on function public.fetch_room_recommendations_v1(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision) to service_role;
comment on function public.fetch_room_recommendations_v1(text,bigint,bigint,text[],text[],text,text[],text[],text[],text[],text,uuid[],double precision,double precision)
  is 'Public eligible rooms only; caller supplies already-expanded recommendation prices. Fixed 3 km when center supplied; newest timestamp then ID. Server-only, no private room fields.';
