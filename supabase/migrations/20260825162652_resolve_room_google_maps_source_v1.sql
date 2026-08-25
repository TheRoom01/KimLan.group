create or replace function public.resolve_room_google_maps_source_v1(
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_effective_role integer := 0;
  v_result jsonb;
begin
  if p_id is null then
    return null;
  end if;

  if v_uid is not null then
    select coalesce(au.level, 0)
      into v_effective_role
    from public.admin_users au
    where au.user_id = v_uid
    limit 1;

    if v_effective_role not in (1, 2) then
      v_effective_role := 0;
    end if;
  end if;

  select jsonb_build_object(
    'latitude', p.latitude,
    'longitude', p.longitude,
    'google_maps_url', coalesce(
      nullif(btrim(p.google_maps_url), ''),
      nullif(btrim(r.google_maps_url), '')
    ),
    'house_number', coalesce(
      nullif(btrim(p.house_number), ''),
      nullif(btrim(r.house_number), '')
    ),
    'address', coalesce(
      nullif(btrim(p.address), ''),
      nullif(btrim(r.address), '')
    ),
    'ward', coalesce(
      nullif(btrim(p.ward), ''),
      nullif(btrim(r.ward), '')
    ),
    'district', coalesce(
      nullif(btrim(p.district), ''),
      nullif(btrim(r.district), '')
    ),
    'city', nullif(btrim(p.city), '')
  )
    into v_result
  from public.rooms r
  left join public.properties p on p.id = r.property_id
  where r.id = p_id
    and coalesce(r.is_hidden, false) = false
    and (
      (
        v_effective_role = 1
        and exists (
          select 1 from public.room_full_admin_l1 v where v.id = r.id
        )
      )
      or (
        v_effective_role = 2
        and exists (
          select 1 from public.room_full_admin_l2 v where v.id = r.id
        )
      )
      or (
        v_effective_role = 0
        and exists (
          select 1 from public.room_full_public v where v.id = r.id
        )
      )
    )
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.resolve_room_google_maps_source_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_room_google_maps_source_v1(uuid)
  to anon, authenticated, service_role;

comment on function public.resolve_room_google_maps_source_v1(uuid) is
  'Returns the minimal authorized location source for one visible room. Coordinates take precedence in the application.';
