begin;

create or replace function public.can_archive_property(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    coalesce(public.is_admin_l1(), false)
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and pm.role = 'owner'
    );
$function$;

create or replace function public.can_manage_property(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    coalesce(public.is_admin_l1(), false)
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and pm.role in (
          'owner',
          'manager'
        )
    );
$function$;

create or replace function public.can_view_property(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    coalesce(public.is_admin_l1(), false)
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and pm.role in (
          'owner',
          'manager',
          'viewer'
        )
    );
$function$;

create or replace function public.can_manage_room(
  p_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.property_id is not null
      and public.can_manage_property(r.property_id)
  );
$function$;

revoke all
on function public.can_archive_property(uuid)
from public, anon;

revoke all
on function public.can_manage_property(uuid)
from public, anon;

revoke all
on function public.can_view_property(uuid)
from public, anon;

revoke all
on function public.can_manage_room(uuid)
from public, anon;

grant execute
on function public.can_archive_property(uuid)
to authenticated, service_role;

grant execute
on function public.can_manage_property(uuid)
to authenticated, service_role;

grant execute
on function public.can_view_property(uuid)
to authenticated, service_role;

grant execute
on function public.can_manage_room(uuid)
to authenticated, service_role;

commit;
