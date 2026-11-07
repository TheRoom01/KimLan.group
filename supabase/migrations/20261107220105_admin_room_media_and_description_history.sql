-- Room descriptions stay on the room row. Price and visibility history still
-- use their existing before/after values and the existing restore RPC.
do $$
declare
  capture_definition text := pg_get_functiondef('room_audit_private.capture()'::regprocedure);
  previous_projection constant text := $projection$when 'rooms' then array['description','chinh_sach']$projection$;
  new_projection constant text := $projection$when 'rooms' then array['chinh_sach']$projection$;
begin
  if strpos(capture_definition, previous_projection) > 0 then
    execute replace(capture_definition, previous_projection, new_projection);
  elsif strpos(capture_definition, new_projection) = 0 then
    raise exception 'Unexpected room history description projection';
  end if;
end;
$$;

-- The older hidden-room timeline also records saves. Keep its visibility
-- actions and substantive edits, without recording description-only saves.
do $$
declare
  hidden_save_definition text := pg_get_functiondef('public.admin_l1_save_hidden_room_v1(uuid,jsonb,text)'::regprocedure);
  before_insert constant text := replace($code$select * into v_after from public.rooms where id = p_room_id;
    insert into public.room_lifecycle_audit ($code$, E'\r\n', E'\n');
  conditional_insert constant text := replace($code$select * into v_after from public.rooms where id = p_room_id;
    if (to_jsonb(v_before) - array['description','updated_at','search_text','search_address_text'])
      is not distinct from (to_jsonb(v_after) - array['description','updated_at','search_text','search_address_text']) then
      return to_jsonb(v_after);
    end if;
    insert into public.room_lifecycle_audit ($code$, E'\r\n', E'\n');
begin
  -- The deployed source and local migration may differ in line endings.
  hidden_save_definition := replace(hidden_save_definition, E'\r\n', E'\n');
  if strpos(hidden_save_definition, before_insert) > 0 then
    execute replace(hidden_save_definition, before_insert, conditional_insert);
  elsif strpos(hidden_save_definition, conditional_insert) = 0 then
    raise exception 'Unexpected hidden room save audit definition';
  end if;
end;
$$;

create or replace function public.sync_admin_room_media_v1(
  p_room_id uuid,
  p_media jsonb,
  p_expected_media jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_media jsonb;
  membership_changed boolean;
begin
  if auth.uid() is null or coalesce(public.get_my_admin_level(), 0) not in (1, 2) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_room_id is null or jsonb_typeof(p_media) is distinct from 'array' or
    jsonb_typeof(p_expected_media) is distinct from 'array' then
    raise exception 'INVALID_ROOM_MEDIA' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_media) as item
    where coalesce(item->>'type', '') not in ('image', 'video')
      or jsonb_typeof(item->'url') is distinct from 'string'
      or nullif(btrim(item->>'url'), '') is null
  ) then
    raise exception 'INVALID_ROOM_MEDIA' using errcode = '22023';
  end if;

  -- Serialize Admin saves for this room and lock the exact existing media
  -- whose snapshot is compared. The mutation below is a single transaction.
  perform pg_advisory_xact_lock(hashtextextended('admin_room_media:' || p_room_id::text, 0));
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', type, 'url', url, 'sort_order', coalesce(sort_order, 0), 'is_cover', coalesce(is_cover, false)
  ) order by id), '[]'::jsonb) into current_media
  from (
    select id, type, url, sort_order, is_cover from public.room_media
    where room_id = p_room_id order by id for update
  ) locked_media;

  if current_media is distinct from p_expected_media then
    raise exception 'ROOM_MEDIA_CONFLICT' using errcode = '40001';
  end if;

  -- Match repeated URLs by occurrence so retained rows keep their id and
  -- metadata. Each modifying CTE targets a disjoint set of rows.
  with desired_items as (
    select item->>'type' as type, item->>'url' as url, (position - 1)::integer as sort_order,
      coalesce(min(position) filter (where item->>'type' = 'image') over (), 1) = position as is_cover,
      row_number() over (partition by item->>'type', item->>'url' order by position) as occurrence
    from jsonb_array_elements(p_media) with ordinality as items(item, position)
  ), existing_items as (
    select *, row_number() over (partition by type, url order by sort_order, id) as occurrence
    from jsonb_to_recordset(current_media) as items(id uuid, type text, url text, sort_order integer, is_cover boolean)
  ), plan as (
    select old.id, new.type, new.url, new.sort_order, new.is_cover
    from existing_items old full join desired_items new using (type, url, occurrence)
  ), removed as (
    delete from public.room_media media using plan
    where media.id = plan.id and plan.type is null returning 1
  ), reordered as (
    update public.room_media media set sort_order = plan.sort_order, is_cover = plan.is_cover
    from plan where media.id = plan.id and plan.type is not null
      and (media.sort_order, media.is_cover) is distinct from (plan.sort_order, plan.is_cover)
  ), added as (
    insert into public.room_media(room_id, provider, type, url, sort_order, is_cover)
    select p_room_id, 'r2', type, url, sort_order, is_cover from plan where id is null
    returning 1
  )
  select exists (select 1 from removed) or exists (select 1 from added) into membership_changed;

  return membership_changed;
end;
$$;

revoke all on function public.sync_admin_room_media_v1(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.sync_admin_room_media_v1(uuid, jsonb, jsonb) to authenticated;
