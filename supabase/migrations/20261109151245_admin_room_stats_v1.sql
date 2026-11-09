create schema if not exists private;

create or replace function private.get_admin_room_stats_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_level integer := 0;
  v_result jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select coalesce(au.level, 0)
    into v_level
  from public.admin_users au
  where au.user_id = v_uid
  limit 1;

  if v_level not in (1, 2) then
    return null;
  end if;

  select jsonb_build_object(
    'total', count(*)::integer,
    'available', count(*) filter (where r.status = 'Đang trống')::integer,
    'upcoming', count(*) filter (where r.status = 'Sắp trống')::integer,
    'rented', count(*) filter (where r.status = 'Đã thuê')::integer
  )
    into v_result
  from public.rooms r
  where coalesce(r.lifecycle_status, 'active') = 'active'
    and coalesce(r.is_hidden, false) = false;

  return v_result;
end;
$$;

revoke all on function private.get_admin_room_stats_v1()
  from public, anon, authenticated, service_role;
grant execute on function private.get_admin_room_stats_v1()
  to authenticated, service_role;

create or replace function public.get_admin_room_stats_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_admin_room_stats_v1();
$$;

revoke all on function public.get_admin_room_stats_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_room_stats_v1()
  to authenticated, service_role;

comment on function public.get_admin_room_stats_v1() is
  'Returns compact whole-app active visible room counts for authenticated admins.';
