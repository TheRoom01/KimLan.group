begin;

create or replace function public.url_encode_component_v1(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_bytes bytea := convert_to(p_value, 'UTF8');
  v_index integer;
  v_byte integer;
  v_result text := '';
begin
  for v_index in 0..length(v_bytes) - 1 loop
    v_byte := get_byte(v_bytes, v_index);

    if (v_byte between 48 and 57)
      or (v_byte between 65 and 90)
      or (v_byte between 97 and 122)
      or v_byte in (45, 46, 95, 126)
    then
      v_result := v_result || chr(v_byte);
    else
      v_result := v_result || '%' || upper(lpad(to_hex(v_byte), 2, '0'));
    end if;
  end loop;

  return v_result;
end;
$function$;

create or replace function public.build_google_maps_search_url_v1(
  p_house_number text,
  p_address text,
  p_ward text,
  p_district text,
  p_city text
)
returns text
language sql
immutable
set search_path = public, pg_catalog, pg_temp
as $function$
  select case
    when address_parts.full_address = '' then null
    else 'https://www.google.com/maps/search/?api=1&query='
      || public.url_encode_component_v1(address_parts.full_address)
  end
  from (
    select concat_ws(
      ', ',
      nullif(btrim(concat_ws(' ', nullif(btrim(p_house_number), ''), nullif(btrim(p_address), ''))), ''),
      nullif(btrim(p_ward), ''),
      nullif(btrim(p_district), ''),
      nullif(btrim(p_city), '')
    ) as full_address
  ) address_parts;
$function$;

create or replace function public.apply_property_google_maps_url_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_generated_new text;
  v_generated_old text;
  v_address_changed boolean;
begin
  v_generated_new := public.build_google_maps_search_url_v1(
    new.house_number,
    new.address,
    new.ward,
    new.district,
    new.city
  );

  if tg_op = 'INSERT' then
    if nullif(btrim(new.google_maps_url), '') is null then
      new.google_maps_url := v_generated_new;
    end if;
    return new;
  end if;

  v_generated_old := public.build_google_maps_search_url_v1(
    old.house_number,
    old.address,
    old.ward,
    old.district,
    old.city
  );
  v_address_changed :=
    new.house_number is distinct from old.house_number
    or new.address is distinct from old.address
    or new.ward is distinct from old.ward
    or new.district is distinct from old.district
    or new.city is distinct from old.city;

  if nullif(btrim(new.google_maps_url), '') is null
    or (
      v_address_changed
      and new.google_maps_url is not distinct from old.google_maps_url
      and old.google_maps_url is not distinct from v_generated_old
    )
  then
    new.google_maps_url := v_generated_new;
  end if;

  return new;
end;
$function$;

create or replace function public.inherit_room_google_maps_url_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.property_id is null then
    return new;
  end if;

  select coalesce(
    nullif(btrim(p.google_maps_url), ''),
    public.build_google_maps_search_url_v1(
      p.house_number,
      p.address,
      p.ward,
      p.district,
      p.city
    )
  )
  into new.google_maps_url
  from public.properties p
  where p.id = new.property_id;

  return new;
end;
$function$;

create or replace function public.sync_property_google_maps_to_rooms_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.google_maps_url is not distinct from old.google_maps_url then
    return new;
  end if;

  update public.rooms
  set google_maps_url = new.google_maps_url
  where property_id = new.id
    and google_maps_url is distinct from new.google_maps_url;

  return new;
end;
$function$;

drop trigger if exists trg_apply_property_google_maps_url_v1
  on public.properties;
create trigger trg_apply_property_google_maps_url_v1
before insert or update of house_number, address, ward, district, city, google_maps_url
on public.properties
for each row
execute function public.apply_property_google_maps_url_v1();

drop trigger if exists trg_inherit_room_google_maps_url_v1
  on public.rooms;
create trigger trg_inherit_room_google_maps_url_v1
before insert or update of property_id, google_maps_url
on public.rooms
for each row
execute function public.inherit_room_google_maps_url_v1();

drop trigger if exists trg_sync_property_google_maps_to_rooms_v1
  on public.properties;
create trigger trg_sync_property_google_maps_to_rooms_v1
after update of google_maps_url
on public.properties
for each row
execute function public.sync_property_google_maps_to_rooms_v1();

-- Generate one URL per property. Existing manually curated property URLs stay
-- intact; empty URLs use the full address already stored in the property row.
update public.properties
set google_maps_url = public.build_google_maps_search_url_v1(
  house_number,
  address,
  ward,
  district,
  city
)
where nullif(btrim(google_maps_url), '') is null;

-- A room always shares its property's location. This deliberately makes the
-- property the source of truth and replaces legacy room-specific URLs.
update public.rooms r
set google_maps_url = p.google_maps_url
from public.properties p
where r.property_id = p.id
  and r.google_maps_url is distinct from p.google_maps_url;

comment on function public.build_google_maps_search_url_v1(text, text, text, text, text) is
  'Builds a cross-platform Google Maps search URL from a Vietnamese address.';

revoke all on function public.url_encode_component_v1(text)
  from public, anon, authenticated;
revoke all on function public.build_google_maps_search_url_v1(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_property_google_maps_url_v1()
  from public, anon, authenticated;
revoke all on function public.inherit_room_google_maps_url_v1()
  from public, anon, authenticated;
revoke all on function public.sync_property_google_maps_to_rooms_v1()
  from public, anon, authenticated;

grant execute on function public.url_encode_component_v1(text)
  to service_role;
grant execute on function public.build_google_maps_search_url_v1(text, text, text, text, text)
  to service_role;

commit;
