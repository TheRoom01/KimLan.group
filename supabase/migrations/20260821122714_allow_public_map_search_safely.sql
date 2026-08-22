begin;

-- Preserve the only legacy coordinates already curated on rooms. New and
-- edited locations remain canonical on properties after this one-time bridge.
update public.properties p
set latitude = legacy.lat,
    longitude = legacy.lng
from (
  select distinct on (r.property_id)
    r.property_id,
    r.lat,
    r.lng
  from public.rooms r
  where r.property_id is not null
    and r.lat between -90 and 90
    and r.lng between -180 and 180
  order by r.property_id, r.updated_at desc nulls last, r.id
) legacy
where p.id = legacy.property_id
  and p.latitude is null
  and p.longitude is null;

-- This is an intentionally public, read-only API. It reuses room_full_public,
-- the same projection as the existing home listing, so private owner/admin
-- fields can never be returned even though the function crosses table RLS.
create or replace function public.search_rooms_in_map_v1(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_search text default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_districts text[] default null,
  p_room_types text[] default null,
  p_center_lat double precision default null,
  p_center_lng double precision default null,
  p_radius_km double precision default null,
  p_limit integer default 3000
)
returns table (
  id uuid,
  room_code text,
  room_type text,
  price bigint,
  status text,
  address text,
  ward text,
  district text,
  latitude double precision,
  longitude double precision,
  thumbnail text,
  distance_km double precision
)
language sql
stable
security definer
set search_path = ''
as $function$
  with candidates as (
    select
      v.id,
      v.room_code::text,
      v.room_type::text,
      v.price::bigint,
      v.status::text,
      concat_ws(
        ' ',
        nullif(btrim(p.house_number), ''),
        nullif(btrim(p.address), '')
      )::text as address,
      p.ward::text,
      p.district::text,
      p.latitude,
      p.longitude,
      p.cover_image::text as thumbnail,
      case when p_center_lat is not null and p_center_lng is not null then
        6371 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(p.latitude - p_center_lat) / 2), 2)
          + cos(radians(p_center_lat)) * cos(radians(p.latitude))
          * power(sin(radians(p.longitude - p_center_lng) / 2), 2)
        )))
      else null end as distance_km
    from public.room_full_public v
    join public.properties p on p.id = v.property_id
    where
      -- Validate direct RPC callers as well as requests through the API route.
      p_west between -180 and 180
      and p_east between -180 and 180
      and p_south between -90 and 90
      and p_north between -90 and 90
      and p_west < p_east
      and p_south < p_north
      and (p_center_lat is null or p_center_lat between -90 and 90)
      and (p_center_lng is null or p_center_lng between -180 and 180)
      and (p_radius_km is null or p_radius_km between 0.1 and 50)
      and ((p_center_lat is null and p_center_lng is null and p_radius_km is null)
        or (p_center_lat is not null and p_center_lng is not null))
      and p.latitude between p_south and p_north
      and p.longitude between p_west and p_east
      and (v.status is null or lower(v.status) not in ('đã thuê', 'da thue'))
      and (p_min_price is null or v.price >= p_min_price)
      and (p_max_price is null or v.price <= p_max_price)
      and (p_districts is null or cardinality(p_districts) = 0 or p.district = any(p_districts))
      and (p_room_types is null or cardinality(p_room_types) = 0 or v.room_type = any(p_room_types))
      and (
        nullif(btrim(p_search), '') is null
        or public.norm_room_search_text(concat_ws(
          ' ', v.room_code, v.room_type, p.house_number,
          p.address, p.ward, p.district
        )) like '%' || public.norm_room_search_text(left(btrim(p_search), 120)) || '%'
      )
  )
  select * from candidates
  where p_radius_km is null or distance_km <= p_radius_km
  order by distance_km asc nulls last, price asc nulls last, id
  limit least(greatest(coalesce(p_limit, 3000), 1), 5000);
$function$;

revoke all on function public.search_rooms_in_map_v1(
  double precision, double precision, double precision, double precision,
  text, bigint, bigint, text[], text[], double precision, double precision,
  double precision, integer
) from public;
grant execute on function public.search_rooms_in_map_v1(
  double precision, double precision, double precision, double precision,
  text, bigint, bigint, text[], text[], double precision, double precision,
  double precision, integer
) to anon, authenticated;

comment on function public.search_rooms_in_map_v1 is
  'Public Map Search over room_full_public. Returns only bounded, non-private map fields.';

commit;
