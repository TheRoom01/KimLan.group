begin;

-- rooms.owner_id is the public listing/contact owner. It is intentionally
-- independent from property ownership and owner portal permissions.
create or replace function public.release_my_property_access_v1(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_roles text[];
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.properties where id = p_property_id) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  select array_agg(distinct pm.role), jsonb_build_object(
    'active_memberships', count(*) filter (where pm.status = 'active'),
    'legacy_owner_mapping', exists(
      select 1 from public.property_owners po
      where po.property_id = p_property_id and po.user_id = v_uid
    )
  ) into v_roles, v_before
  from public.property_members pm
  where pm.property_id = p_property_id and pm.user_id = v_uid
    and pm.status = 'active' and pm.role in ('owner', 'manager');

  if coalesce(array_length(v_roles, 1), 0) = 0 then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not (v_roles && array['owner','manager']::text[]) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  update public.property_members
  set status = 'revoked', updated_at = now()
  where property_id = p_property_id and user_id = v_uid
    and status = 'active' and role in ('owner', 'manager');

  delete from public.property_owners
  where property_id = p_property_id and user_id = v_uid;

  v_after := jsonb_build_object(
    'active_memberships', (
      select count(*) from public.property_members pm
      where pm.property_id = p_property_id and pm.user_id = v_uid
        and pm.status = 'active' and pm.role in ('owner', 'manager')
    ),
    'legacy_owner_mapping', exists(
      select 1 from public.property_owners po
      where po.property_id = p_property_id and po.user_id = v_uid
    )
  );

  insert into public.property_ownership_audit (
    property_id, affected_user_id, previous_roles, actor_user_id,
    action, ownership_before, ownership_after, source
  ) values (
    p_property_id, v_uid, v_roles, v_uid,
    'released', v_before, v_after, 'building_ownership_released'
  );

  return jsonb_build_object('id', p_property_id, 'released', true, 'previous_roles', v_roles);
end;
$function$;

revoke all on function public.release_my_property_access_v1(uuid) from public, anon;
grant execute on function public.release_my_property_access_v1(uuid) to authenticated, service_role;

commit;
