-- Rank strict address matches ahead of prefix, contains and fuzzy matches.
-- This function is shared by Home and /admin.
create or replace function public.room_address_search_score(
  p_house_number text,
  p_address text,
  p_ward text,
  p_district text,
  p_room_code text,
  p_search text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select
      public.norm_room_search_text(coalesce(p_house_number, '')) as house_number,
      public.norm_room_search_text(coalesce(p_address, '')) as address,
      public.norm_room_search_text(
        concat_ws(' ', p_house_number, p_address)
      ) as street_address,
      public.norm_room_search_text(
        concat_ws(' ', p_house_number, p_address, p_ward, p_district)
      ) as full_address,
      public.norm_room_search_text(coalesce(p_search, '')) as query
  )
  select case
    when query = '' then 0

    -- 100% matches always win. House number is first because users commonly
    -- search only for values such as "257/17".
    when house_number = query then 12000
    when full_address = query then 11900
    when street_address = query then 11800
    when address = query then 11700

    -- A phrase at the beginning is stronger than the same phrase elsewhere.
    when street_address like query || '%' then 10500
    when full_address like query || '%' then 10400
    when street_address like '%' || query || '%' then 9500
    when full_address like '%' || query || '%' then 9400
    when house_number like '%' || query || '%' then 9300

    -- Fuzzy candidates can never outrank a strict match.
    else 1000 + round(extensions.similarity(full_address, query) * 5000)::integer
  end
  from normalized;
$$;

comment on function public.room_address_search_score(text, text, text, text, text, text)
is 'Ranks exact house/address matches before prefix, contains, and fuzzy address matches.';
