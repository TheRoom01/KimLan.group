begin;

-- property_members is the primary permission source. property_owners remains
-- an existing ownership mapping used by older records, so a mapped owner must
-- retain the same owner-portal permissions without creating a new membership.
create or replace function public.can_archive_property(p_property_id uuid)
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
    )
    or exists (
      select 1
      from public.property_owners po
      where po.property_id = p_property_id
        and po.user_id = auth.uid()
    );
$function$;

create or replace function public.can_manage_property(p_property_id uuid)
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
        and pm.role in ('owner', 'manager')
    )
    or exists (
      select 1
      from public.property_owners po
      where po.property_id = p_property_id
        and po.user_id = auth.uid()
    );
$function$;

create or replace function public.can_view_property(p_property_id uuid)
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
        and pm.role in ('owner', 'manager', 'viewer')
    )
    or exists (
      select 1
      from public.property_owners po
      where po.property_id = p_property_id
        and po.user_id = auth.uid()
    );
$function$;

revoke all on function public.can_archive_property(uuid) from public, anon;
revoke all on function public.can_manage_property(uuid) from public, anon;
revoke all on function public.can_view_property(uuid) from public, anon;
grant execute on function public.can_archive_property(uuid) to authenticated, service_role;
grant execute on function public.can_manage_property(uuid) to authenticated, service_role;
grant execute on function public.can_view_property(uuid) to authenticated, service_role;

commit;
