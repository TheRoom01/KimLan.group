-- Use the admin scorer and minimum query length in every Home role branch.
-- Preserve permissions, filters, payloads and existing page-size limits.
-- Explicit ordering also protects JSON aggregation and cursor selection.
do $migration$
declare
  definition text;
  previous text;
begin
  select pg_get_functiondef(oid) into strict definition
  from pg_proc where pronamespace = 'public'::regnamespace
    and proname = 'fetch_rooms_cursor_full_v1';
  definition := replace(definition, chr(13), '');

  previous := definition;
  definition := replace(definition, $old$if length(s) < 2 then$old$, $new$if length(s) < 3 then$new$);
  if definition = previous then raise exception 'Home search patch 1 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$greatest(
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s then 1000 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%' then 900 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%' then 800 else 0 end,
        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
      )::int$old$, $new$public.room_address_search_score(v.house_number, v.address, v.ward, v.district, null, s)$new$);
  if definition = previous then raise exception 'Home search patch 2 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$greatest(
        case when public.norm_room_search_text(coalesce(v.house_number, '')) = s then 980 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s then 1000 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%' then 900 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%' then 800 else 0 end,
        case when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%' then 700 else 0 end,
        public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
      )::int$old$, $new$public.room_address_search_score(v.house_number, v.address, v.ward, v.district, null, s)$new$);
  if definition = previous then raise exception 'Home search patch 3 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$else greatest(
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s
            then 1000 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%'
            then 900 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 800 else 0
          end,
          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
        )
      end::int as search_score$old$, $new$else public.room_address_search_score(v.house_number, v.address, v.ward, v.district, null, s)
      end::int as search_score$new$);
  if definition = previous then raise exception 'Home search patch 4 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$else greatest(
          case
            when public.norm_room_search_text(coalesce(v.house_number, '')) = s
            then 980 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) = s
            then 1000 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like s || '%'
            then 900 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.ward, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 800 else 0
          end,
          case
            when public.norm_room_search_text(concat_ws(' ', coalesce(v.house_number, ''), coalesce(v.address, ''), coalesce(v.district, ''))) like '%' || s || '%'
            then 700 else 0
          end,
          public.room_address_search_score(v.house_number, v.address, v.ward, v.district, v.room_code, s)
        )
      end::int as search_score$old$, $new$else public.room_address_search_score(v.house_number, v.address, v.ward, v.district, null, s)
      end::int as search_score$new$);
  if definition = previous then raise exception 'Home search patch 5 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$jsonb_agg(sliced.row_json)$old$, $new$jsonb_agg(sliced.row_json order by
      case when s is not null then sliced.search_score end desc,
      case when s is not null then sliced.updated_at end desc nulls last,
      case when s is not null then sliced.created_at end desc nulls last,
      case when s is not null then sliced.id end desc,

      case when s is null and sort_mode = 'price_asc' then sliced.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then sliced.id end asc,

      case when s is null and sort_mode = 'price_desc' then sliced.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then sliced.id end asc,

      case when s is null and sort_mode = 'updated_desc' then sliced.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then sliced.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then sliced.id end desc
    )$new$);
  if definition = previous then raise exception 'Home search patch 6 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$select * from src limit$old$, $new$select * from src order by
      case when s is not null then src.search_score end desc,
      case when s is not null then src.updated_at end desc nulls last,
      case when s is not null then src.created_at end desc nulls last,
      case when s is not null then src.id end desc,

      case when s is null and sort_mode = 'price_asc' then src.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then src.id end asc,

      case when s is null and sort_mode = 'price_desc' then src.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then src.id end asc,

      case when s is null and sort_mode = 'updated_desc' then src.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then src.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then src.id end desc
    limit$new$);
  if definition = previous then raise exception 'Home search patch 7 did not match'; end if;

  previous := definition;
  definition := replace(definition, $old$    from src
    offset$old$, $new$    from src
    order by
      case when s is not null then src.search_score end desc,
      case when s is not null then src.updated_at end desc nulls last,
      case when s is not null then src.created_at end desc nulls last,
      case when s is not null then src.id end desc,

      case when s is null and sort_mode = 'price_asc' then src.price end asc nulls last,
      case when s is null and sort_mode = 'price_asc' then src.id end asc,

      case when s is null and sort_mode = 'price_desc' then src.price end desc nulls last,
      case when s is null and sort_mode = 'price_desc' then src.id end asc,

      case when s is null and sort_mode = 'updated_desc' then src.updated_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then src.created_at end desc nulls last,
      case when s is null and sort_mode = 'updated_desc' then src.id end desc
    offset$new$);
  if definition = previous then raise exception 'Home search patch 8 did not match'; end if;

  execute definition;
end;
$migration$;
