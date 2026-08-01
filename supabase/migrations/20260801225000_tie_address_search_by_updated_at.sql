create or replace function public.room_address_search_score(
  p_house_number text, p_address text, p_ward text, p_district text,
  p_room_code text, p_search text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select
      public.norm_room_search_text(concat_ws(' ', p_house_number, p_address, p_ward, p_district)) as full_address,
      public.norm_room_search_text(concat_ws(' ', p_house_number, p_address)) as street_address,
      public.norm_room_search_text(coalesce(p_room_code, '')) as room_code,
      public.norm_room_search_text(coalesce(p_search, '')) as query
  )
  select case
    when query = '' then 0
    when full_address = query then 10000
    when street_address = query then 9800
    when room_code = query then 9600
    when full_address like query || '%' then 9000
    when full_address like '%' || query || '%' then 8000
    when street_address like '%' || query || '%' then 7800
    else 1000 + round(extensions.similarity(full_address, query) * 5000)::integer
  end
  from normalized;
$$;
