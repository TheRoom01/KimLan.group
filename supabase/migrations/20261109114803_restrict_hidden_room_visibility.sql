-- Both admin projections are internal to the role-checked RPCs. Filter the
-- shared views so detail, listings, badges and reports use the same boundary.
do $migration$
declare
  name text;
  definition text;
begin
  foreach name in array array['room_full_admin_l1', 'room_full_admin_l2'] loop
    definition := regexp_replace(pg_get_viewdef(('public.' || name)::regclass), ';$', '');
    if name = 'room_full_admin_l2' then
      if definition not like '%WHERE (COALESCE(r.is_hidden, false) = false)' then
        raise exception 'Unexpected definition of %', name;
      end if;
      definition := regexp_replace(definition, 'WHERE \(COALESCE\(r.is_hidden, false\) = false\)$', '');
    end if;
    execute format('create or replace view public.%I as %s where %s', name, definition,
      $predicate$(not coalesce(r.is_hidden, false)
    or r.hidden_by = (select auth.uid())
    or (select lower(auth.jwt()->>'email') = 'voduongngoclan@gmail.com')
    or (select auth.jwt()->>'role' = 'service_role'))$predicate$);
  end loop;
end;
$migration$;

revoke select on public.room_full_admin_l1, public.room_full_admin_l2 from public, anon, authenticated;

-- Preserve the owner portal policies for users outside the admin roles.
create policy rooms_admin_hidden_visibility on public.rooms
as restrictive for select to authenticated
using (
  not coalesce(is_hidden, false)
  or coalesce((select public.get_my_admin_level()), 0) not in (1, 2)
  or hidden_by = (select auth.uid())
  or (select lower(auth.jwt()->>'email') = 'voduongngoclan@gmail.com')
);

alter policy rooms_admin_l2_select_visible on public.rooms
using (public.is_admin_l2((select auth.uid())));

create policy room_details_admin_hidden_visibility on public.room_details
as restrictive for select to authenticated
using (
  coalesce((select public.get_my_admin_level()), 0) not in (1, 2)
  or exists (select 1 from public.rooms r where r.id = room_details.room_id)
);

create policy room_media_admin_hidden_visibility on public.room_media
as restrictive for select to authenticated
using (
  coalesce((select public.get_my_admin_level()), 0) not in (1, 2)
  or exists (select 1 from public.rooms r where r.id = room_media.room_id)
);

-- Retain the deployed RPC signatures, existing projections and cursor logic.
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in
    select * from (values
      (1, 'fetch_rooms_cursor_full_v1', $old$ sort_mode text := coalesce(nullif(p_sort, ''), 'updated_desc');$old$, $new$ hidden_only boolean := false;
 sort_mode text := coalesce(nullif(p_sort, ''), 'updated_desc');$new$),
      (2, 'fetch_rooms_cursor_full_v1', $old$SELECT EXISTS(
  SELECT 1
  FROM public.vip_access_links$old$, $new$if sort_mode = 'hidden' then
  hidden_only := coalesce(effective_role in (1, 2)
    and lower(auth.jwt()->>'email') = 'voduongngoclan@gmail.com', false);
  sort_mode := 'updated_desc';
end if;

SELECT EXISTS(
  SELECT 1
  FROM public.vip_access_links$new$),
      (3, 'fetch_rooms_cursor_full_v1', $old$        'is_hidden', coalesce(r.is_hidden, false)
      ) as row_json
    from public.room_full_admin_l1 v
    join public.rooms r on r.id = v.id
    left join public.admin_users au on au.user_id = r.owner_id
    left join public.room_details rd on rd.room_id = v.id
    where
      (p_min_price$old$, $new$        'is_hidden', coalesce(r.is_hidden, false)
      ) as row_json
    from public.room_full_admin_l1 v
    join public.rooms r on r.id = v.id
    left join public.admin_users au on au.user_id = r.owner_id
    left join public.room_details rd on rd.room_id = v.id
    where
      (not hidden_only or r.is_hidden is true)
      and (p_min_price$new$),
      (4, 'fetch_rooms_cursor_full_v1', $old$        'available_from', r.available_from
      ) as row_json
    from public.room_full_admin_l2 v$old$, $new$        'available_from', r.available_from,
        'is_hidden', coalesce(r.is_hidden, false)
      ) as row_json
    from public.room_full_admin_l2 v$new$),
      (5, 'fetch_rooms_cursor_full_v1', $old$      coalesce(r.is_hidden, false) = false
      and (p_min_price$old$, $new$      (not hidden_only or r.is_hidden is true)
      and (p_min_price$new$),
      (6, 'fetch_room_detail_full_v1', $old$if v_is_hidden = true and effective_role <> 1 then$old$, $new$if v_is_hidden = true and coalesce(effective_role, 0) not in (1, 2) then$new$),
      (7, 'fetch_admin_rooms_l2_v2', $old$    where v.is_hidden = false
      and (s is null$old$, $new$    where (s is null$new$),
      (8, 'fetch_admin_rooms_l2_v2', $old$      and (p_report is null
        or (p_report = 'no_zalo'$old$, $new$      and (p_report is null
        or (p_report = 'hidden' and v.is_hidden is true)
        or (p_report = 'no_zalo'$new$),
      (9, 'fetch_rooms_cursor_full_v3_1', $old$WHERE coalesce(r.is_hidden,false) = false$old$, $new$WHERE true$new$),
      (10, 'hide_room', $old$  WHERE id = p_room_id;$old$, $new$  WHERE id = p_room_id and is_hidden is not true;$new$),
      (11, 'hide_room', $old$  IF NOT FOUND THEN$old$, $new$  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.id = p_room_id AND r.is_hidden is true
      AND (r.hidden_by = auth.uid() OR lower(auth.jwt()->>'email') = 'voduongngoclan@gmail.com')
  ) THEN$new$),
      (12, 'admin_l1_save_hidden_room_v1', $old$  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;$old$, $new$  if not found or (v_before.is_hidden is true
    and v_before.hidden_by is distinct from auth.uid()
    and lower(auth.jwt()->>'email') is distinct from 'voduongngoclan@gmail.com') then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;$new$)
    ) as patches(step, name, before_text, after_text)
    order by step
  loop
    select replace(pg_get_functiondef(oid), chr(13), '') into strict definition
    from pg_proc
    where pronamespace = 'public'::regnamespace and proname = patch.name;

    if strpos(definition, patch.before_text) = 0 then
      raise exception 'RPC patch % did not match %', patch.step, patch.name;
    end if;
    execute replace(definition, patch.before_text, patch.after_text);
  end loop;
end;
$migration$;

