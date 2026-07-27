begin;

create or replace function public.update_owner_property_member_role_v1(
  p_property_id uuid,
  p_member_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_member public.property_members%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null or p_member_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id and member_id are required';
  end if;

  if v_role not in ('manager', 'viewer') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'role must be manager or viewer';
  end if;

  if not exists (
    select 1
    from public.properties p
    where p.id = p_property_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property not found';
  end if;

  if exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and p.lifecycle_status = 'archived'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Cannot manage members of an archived property';
  end if;

  if not coalesce(public.is_admin_l1(), false)
    and not exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = v_uid
        and pm.role = 'owner'
        and pm.status = 'active'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select pm.*
  into v_member
  from public.property_members pm
  where pm.id = p_member_id
    and pm.property_id = p_property_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property member not found';
  end if;

  if v_member.role = 'owner' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Owner role can only be changed through ownership transfer';
  end if;

  if v_member.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Only active members can change role';
  end if;

  update public.property_members
  set
    role = v_role,
    updated_at = now()
  where id = p_member_id
  returning *
  into v_member;

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member)
  );
end;
$function$;


create or replace function public.revoke_owner_property_member_v1(
  p_property_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.property_members%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null or p_member_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id and member_id are required';
  end if;

  if not coalesce(public.is_admin_l1(), false)
    and not exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = v_uid
        and pm.role = 'owner'
        and pm.status = 'active'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select pm.*
  into v_member
  from public.property_members pm
  where pm.id = p_member_id
    and pm.property_id = p_property_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property member not found';
  end if;

  if v_member.role = 'owner' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Owner membership cannot be revoked; transfer ownership first';
  end if;

  if v_member.status = 'revoked' then
    return jsonb_build_object(
      'ok', true,
      'member', to_jsonb(v_member)
    );
  end if;

  update public.property_members
  set
    status = 'revoked',
    updated_at = now()
  where id = p_member_id
  returning *
  into v_member;

  return jsonb_build_object(
    'ok', true,
    'member', to_jsonb(v_member)
  );
end;
$function$;


create or replace function public.transfer_owner_property_ownership_v1(
  p_property_id uuid,
  p_new_owner_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_current_owner public.property_members%rowtype;
  v_new_owner public.property_members%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null or p_new_owner_member_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id and new_owner_member_id are required';
  end if;

  if not exists (
    select 1
    from public.properties p
    where p.id = p_property_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property not found';
  end if;

  if exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and p.lifecycle_status = 'archived'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Cannot transfer an archived property';
  end if;

  select pm.*
  into v_current_owner
  from public.property_members pm
  where pm.property_id = p_property_id
    and pm.user_id = v_uid
    and pm.role = 'owner'
    and pm.status = 'active'
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN',
      detail = 'Only an active owner can transfer ownership';
  end if;

  select pm.*
  into v_new_owner
  from public.property_members pm
  where pm.id = p_new_owner_member_id
    and pm.property_id = p_property_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'New owner member not found';
  end if;

  if v_new_owner.user_id = v_uid then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'New owner must be another member';
  end if;

  if v_new_owner.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'New owner must be an active member';
  end if;

  if v_new_owner.role = 'owner' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Selected member is already an owner';
  end if;

  update public.property_members
  set
    role = 'manager',
    status = 'active',
    updated_at = now()
  where id = v_current_owner.id
  returning *
  into v_current_owner;

  update public.property_members
  set
    role = 'owner',
    status = 'active',
    updated_at = now()
  where id = v_new_owner.id
  returning *
  into v_new_owner;

  delete from public.property_owners po
  where po.property_id = p_property_id
    and po.user_id = v_uid;

  insert into public.property_owners (
    property_id,
    user_id,
    created_at
  )
  values (
    p_property_id,
    v_new_owner.user_id,
    now()
  )
  on conflict (property_id, user_id)
  do nothing;

  return jsonb_build_object(
    'ok', true,
    'property_id', p_property_id,
    'previous_owner', to_jsonb(v_current_owner),
    'new_owner', to_jsonb(v_new_owner)
  );
end;
$function$;


revoke all
on function public.update_owner_property_member_role_v1(uuid, uuid, text)
from public, anon;

revoke all
on function public.revoke_owner_property_member_v1(uuid, uuid)
from public, anon;

revoke all
on function public.transfer_owner_property_ownership_v1(uuid, uuid)
from public, anon;

grant execute
on function public.update_owner_property_member_role_v1(uuid, uuid, text)
to authenticated, service_role;

grant execute
on function public.revoke_owner_property_member_v1(uuid, uuid)
to authenticated, service_role;

grant execute
on function public.transfer_owner_property_ownership_v1(uuid, uuid)
to authenticated, service_role;

commit;
