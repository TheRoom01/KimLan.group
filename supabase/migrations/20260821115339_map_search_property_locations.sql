begin;

-- Properties are the canonical location because many rooms share one building.
-- The columns already exist in this project; these guards keep the migration
-- compatible with databases created from older snapshots.
alter table public.properties
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.properties
  drop constraint if exists properties_valid_map_coordinates;
alter table public.properties
  add constraint properties_valid_map_coordinates check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ) not valid;

create index if not exists properties_map_coordinates_idx
  on public.properties (longitude, latitude)
  where latitude is not null
    and longitude is not null
    and lifecycle_status = 'active';

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
security invoker
set search_path = public, pg_temp
as $function$
  with candidates as (
    select
      r.id,
      r.room_code::text,
      r.room_type::text,
      r.price::bigint,
      r.status::text,
      concat_ws(' ', nullif(btrim(p.house_number), ''), nullif(btrim(p.address), ''))::text as address,
      p.ward::text,
      p.district::text,
      p.latitude,
      p.longitude,
      p.cover_image::text as thumbnail,
      case when p_center_lat is not null and p_center_lng is not null then
        6371 * 2 * asin(sqrt(
          power(sin(radians(p.latitude - p_center_lat) / 2), 2)
          + cos(radians(p_center_lat)) * cos(radians(p.latitude))
          * power(sin(radians(p.longitude - p_center_lng) / 2), 2)
        ))
      else null end as distance_km
    from public.rooms r
    join public.properties p on p.id = r.property_id
    where p.lifecycle_status = 'active'
      and p.latitude between p_south and p_north
      and p.longitude between p_west and p_east
      and coalesce(r.is_hidden, false) = false
      and (r.status is null or lower(r.status) not in ('đã thuê', 'da thue'))
      and (p_min_price is null or r.price >= p_min_price)
      and (p_max_price is null or r.price <= p_max_price)
      and (p_districts is null or p.district = any(p_districts))
      and (p_room_types is null or r.room_type = any(p_room_types))
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', r.room_code, r.room_type, p.house_number, p.address, p.ward, p.district)
          ilike '%' || btrim(p_search) || '%'
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
  'RLS-respecting, viewport-bounded room payload for Map Search.';

commit;
