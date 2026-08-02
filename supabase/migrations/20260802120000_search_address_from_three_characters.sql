-- Search on Home and /admin is address-only.  Keep the existing ranking scale,
-- but let an exact house-number prefix pass before applying trigram similarity.

create or replace function public.room_address_search_document(
  p_house_number text,
  p_address text,
  p_ward text,
  p_district text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.norm_room_search_text(
    concat_ws(' ', p_house_number, p_address, p_ward, p_district)
  );
$$;

alter table public.rooms
  add column if not exists search_address_text text
  generated always as (
    public.room_address_search_document(house_number, address, ward, district)
  ) stored;

create index if not exists rooms_search_address_text_trgm_idx
  on public.rooms using gin (search_address_text extensions.gin_trgm_ops);

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
      public.norm_room_search_text(coalesce(p_search, '')) as query
  )
  select case
    when query = '' then 0
    when full_address = query then 10000
    when street_address = query then 9800
    when full_address like query || '%' then 9000
    when full_address like '%' || query || '%' then 8000
    when street_address like '%' || query || '%' then 7800
    else 1000 + round(extensions.similarity(full_address, query) * 5000)::integer
  end
  from normalized;
$$;

create or replace function public.fetch_admin_rooms_l1_v2(
  p_limit integer, p_offset integer, p_search text default null, p_report text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_level integer := 0; s text := null;
  v_data jsonb := '[]'::jsonb; v_total integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(level, 0) into v_level from public.admin_users where user_id = v_uid limit 1;
  if v_level <> 1 then raise exception 'not_authorized'; end if;
  s := nullif(public.norm_room_search_text(p_search), '');
  if s is not null and length(s) < 3 then s := null; end if;

  with raw as (
    select r.id, r.created_at, r.updated_at, r.room_code, r.house_number, r.address,
      r.ward, r.district, r.room_type, r.status, r.link_zalo, r.zalo_phone,
      r.price, r.is_hidden, r.lat, r.lng
    from public.room_full_admin_l1 r
    join public.rooms source_room on source_room.id = r.id
    where (s is null
      or source_room.search_address_text like s || '%'
      or source_room.search_address_text like '%' || s || '%'
      or source_room.search_address_text operator(extensions.%) s)
      and (p_report is null
        or (p_report = 'no_zalo' and coalesce(trim(r.link_zalo), '') = '')
        or (p_report = 'no_owner_phone' and coalesce(trim(r.zalo_phone), '') = '')
        or (p_report = 'no_coordinates' and (r.lat is null or r.lng is null))
        or (p_report = 'hidden' and r.is_hidden = true)
        or (p_report = 'no_media' and not exists (
          select 1 from public.room_media_agg rma where rma.room_id = r.id
            and exists (select 1 from jsonb_array_elements(rma.media) m where m->>'type' = 'image')
        )))
  ), scored as materialized (
    select raw.*, case when s is null then 0 else public.room_address_search_score(
      raw.house_number, raw.address, raw.ward, raw.district, null, s
    ) end as search_score from raw
  ), total_cte as (select count(*)::integer as total_count from scored),
  page_cte as (
    select * from scored order by
      case when s is not null then search_score end desc,
      updated_at desc nulls last, created_at desc nulls last, id desc
    limit greatest(coalesce(p_limit, 20), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(to_jsonb(page_cte) - 'search_score' order by
      case when s is not null then page_cte.search_score end desc,
      page_cte.updated_at desc nulls last, page_cte.created_at desc nulls last, page_cte.id desc
    ), '[]'::jsonb), coalesce((select total_count from total_cte), 0)
  into v_data, v_total from page_cte;
  return jsonb_build_object('data', v_data, 'total', v_total, 'total_count', v_total);
end;
$$;

create or replace function public.fetch_admin_rooms_l2_v2(
  p_limit integer, p_offset integer, p_search text default null, p_report text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_level integer := 0; s text := null;
  v_data jsonb := '[]'::jsonb; v_total integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(level, 0) into v_level from public.admin_users where user_id = v_uid limit 1;
  if v_level <> 2 then raise exception 'not_authorized'; end if;
  s := nullif(public.norm_room_search_text(p_search), '');
  if s is not null and length(s) < 3 then s := null; end if;

  with raw as (
    select v.id, r.owner_id, v.created_at, v.updated_at, v.room_code, v.house_number,
      v.address, v.ward, v.district, v.room_type, v.status,
      case when r.owner_id = v_uid then r.link_zalo else null end as link_zalo,
      case when r.owner_id = v_uid then r.zalo_phone else null end as zalo_phone,
      v.price, v.is_hidden, v.chinh_sach, null::double precision as lat,
      null::double precision as lng,
      exists (select 1 from public.room_media rm where rm.room_id = v.id
        and rm.type = 'image' and coalesce(rm.url, '') <> '') as has_image
    from public.room_full_admin_l2 v join public.rooms r on r.id = v.id
    where v.is_hidden = false
      and (s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s)
      and (p_report is null
        or (p_report = 'no_zalo' and r.owner_id = v_uid and coalesce(trim(r.link_zalo), '') = '')
        or (p_report = 'no_owner_phone' and r.owner_id = v_uid and coalesce(trim(r.zalo_phone), '') = '')
        or (p_report = 'no_media'
          and exists (select 1 from public.room_media rm2 where rm2.room_id = v.id)
          and not exists (select 1 from public.room_media rm3 where rm3.room_id = v.id
            and rm3.type = 'image' and coalesce(rm3.url, '') <> '')))
  ), scored as materialized (
    select raw.*, case when s is null then 0 else public.room_address_search_score(
      raw.house_number, raw.address, raw.ward, raw.district, null, s
    ) end as search_score from raw
  ), total_cte as (select count(*)::integer as total_count from scored),
  page_cte as (
    select * from scored order by
      case when s is not null then search_score end desc,
      updated_at desc nulls last, created_at desc nulls last, id desc
    limit greatest(coalesce(p_limit, 20), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(to_jsonb(page_cte) - 'search_score' order by
      case when s is not null then page_cte.search_score end desc,
      page_cte.updated_at desc nulls last, page_cte.created_at desc nulls last, page_cte.id desc
    ), '[]'::jsonb), coalesce((select total_count from total_cte), 0)
  into v_data, v_total from page_cte;
  return jsonb_build_object('data', v_data, 'total', v_total, 'total_count', v_total);
end;
$$;

-- fetch_rooms_cursor_full_v1 is defined in the linked project. Patch its filter
-- without replacing the rest of its role/filter/pagination behavior.
do $$
declare
  v_oid oid;
  v_definition text;
  v_original text;
  v_old_filter text := 'and (s is null or r.search_text operator(extensions.%) s)';
  v_new_filter text := $filter$and (
        s is null
        or r.search_address_text like s || '%'
        or r.search_address_text like '%' || s || '%'
        or r.search_address_text operator(extensions.%) s
      )$filter$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fetch_rooms_cursor_full_v1';

  if v_oid is null then raise exception 'fetch_rooms_cursor_full_v1 not found'; end if;
  v_definition := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_original := v_definition;
  v_definition := replace(v_definition, v_old_filter, v_new_filter);
  if v_definition = v_original then raise exception 'Home search filter was not replaced'; end if;
  execute v_definition;
end;
$$;

comment on function public.room_address_search_score(text, text, text, text, text, text)
is 'Ranks address-only matches: full address, street address, prefix/contains, then trigram similarity.';
