-- Admin-managed badges for rooms. Project/property badges are intentionally
-- omitted: this application currently has no Admin property edit flow.

alter table public.rooms
  add column if not exists badges text[] not null default '{}'::text[];

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rooms'::regclass
      and conname = 'rooms_badges_valid_values_check'
  ) then
    alter table public.rooms
      add constraint rooms_badges_valid_values_check
      check (
        array_position(badges, null) is null
        and badges <@ array['budget_friendly', 'new_listing', 'featured', 'exclusive']::text[]
      );
  end if;
end;
$constraint$;

create or replace function public.get_room_badges_v1(p_room_ids uuid[])
returns table(room_id uuid, badges text[])
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer := 0;
begin
  if p_room_ids is null or cardinality(p_room_ids) = 0 then
    return;
  end if;
  if cardinality(p_room_ids) > 50 then
    raise exception 'too_many_room_ids';
  end if;

  if v_uid is not null then
    select coalesce(a.level, 0)
      into v_level
      from public.admin_users a
      where a.user_id = v_uid
      limit 1;
  end if;

  if v_level = 1 then
    return query
      select r.id, coalesce(r.badges, '{}'::text[])
      from public.rooms r
      where r.id = any(p_room_ids)
        and exists (select 1 from public.room_full_admin_l1 v where v.id = r.id);
  elsif v_level = 2 then
    return query
      select r.id, coalesce(r.badges, '{}'::text[])
      from public.rooms r
      where r.id = any(p_room_ids)
        and exists (select 1 from public.room_full_admin_l2 v where v.id = r.id);
  else
    return query
      select r.id, coalesce(r.badges, '{}'::text[])
      from public.rooms r
      where r.id = any(p_room_ids)
        and exists (select 1 from public.room_full_public v where v.id = r.id);
  end if;
end;
$function$;

revoke all on function public.get_room_badges_v1(uuid[]) from public;
grant execute on function public.get_room_badges_v1(uuid[]) to anon, authenticated, service_role;

create or replace function public.admin_set_room_badges_v1(p_room_id uuid, p_badges text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer := 0;
  v_saved text[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_room_id is null or p_badges is null or cardinality(p_badges) > 4
     or array_position(p_badges, null) is not null
     or not (p_badges <@ array['budget_friendly', 'new_listing', 'featured', 'exclusive']::text[])
     or cardinality(p_badges) <> (select count(distinct input_badges.value) from unnest(p_badges) as input_badges(value)) then
    raise exception 'invalid_room_badges';
  end if;

  select coalesce(a.level, 0)
    into v_level
    from public.admin_users a
    where a.user_id = v_uid
    limit 1;

  if v_level = 1 then
    update public.rooms r
      set badges = p_badges
      where r.id = p_room_id
        and exists (select 1 from public.room_full_admin_l1 v where v.id = r.id)
      returning r.badges into v_saved;
  elsif v_level = 2 then
    update public.rooms r
      set badges = p_badges
      where r.id = p_room_id
        and exists (select 1 from public.room_full_admin_l2 v where v.id = r.id)
      returning r.badges into v_saved;
  else
    raise exception 'not_authorized';
  end if;

  if v_saved is null then
    raise exception 'room_not_found_or_not_authorized';
  end if;
  return v_saved;
end;
$function$;

revoke all on function public.admin_set_room_badges_v1(uuid, text[]) from public, anon;
grant execute on function public.admin_set_room_badges_v1(uuid, text[]) to authenticated;

-- Keep the existing cursor RPC signature and cursor semantics. The internal
-- badge sentinel is extracted from p_statuses before status matching, so badge
-- filtering happens in SQL before total counting and cursor slicing.
do $cursor_rpc$
declare
  v_definition text;
  v_old_status text := 'or v.status = any(p_statuses)';
  v_new_status text := $replacement$
or (
  (
    not exists (
      select 1 from unnest(p_statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
    )
    or exists (
      select 1 from unnest(p_statuses) as badge_filter(value)
      where left(badge_filter.value, 8) = '__badge:'
        and r.badges @> array[substring(badge_filter.value from 9)]::text[]
    )
  )
  and (
    not exists (
      select 1 from unnest(p_statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:'
    )
    or v.status = any(array(
      select status_filter.value from unnest(p_statuses) as status_filter(value)
      where left(status_filter.value, 8) <> '__badge:'
    ))
  )
)$replacement$;
  v_old_output text := '''has_video'',';
  v_new_output text := '''badges'', coalesce(r.badges, ''{}''::text[]), ''has_video'',';
  v_status_count integer;
  v_output_count integer;
begin
  select pg_get_functiondef(
    'public.fetch_rooms_cursor_full_v1(integer,integer,uuid,text,integer,integer,text[],text[],text,text[],text[],text[],text,timestamp with time zone,timestamp with time zone,uuid,uuid,text)'::regprocedure
  ) into strict v_definition;

  v_status_count := (length(v_definition) - length(replace(v_definition, v_old_status, ''))) / length(v_old_status);
  v_output_count := (length(v_definition) - length(replace(v_definition, v_old_output, ''))) / length(v_old_output);
  if v_status_count <> 3 or v_output_count <> 3 then
    raise exception 'fetch_rooms_cursor_full_v1 definition differs from expected shape; refusing badge patch (status markers %, output markers %)', v_status_count, v_output_count;
  end if;

  v_definition := replace(v_definition, v_old_status, v_new_status);
  v_definition := replace(v_definition, v_old_output, v_new_output);
  execute v_definition;
end;
$cursor_rpc$;

comment on column public.rooms.badges is
  'Admin-managed room badges: budget_friendly, new_listing, featured, exclusive';
