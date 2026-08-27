begin;

alter table public.property_member_invitations
drop constraint if exists property_member_invitations_role_chk;

alter table public.property_member_invitations
add constraint property_member_invitations_role_chk
check (role in ('owner', 'manager'));

create or replace function public.invite_owner_property_member_v2(
  p_property_id uuid,
  p_role text default 'manager',
  p_email text default null,
  p_phone text default null,
  p_invitee_name text default null,
  p_expires_in_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(btrim(coalesce(p_role, 'manager')));
  v_email text;
  v_phone text;
  v_name text;
  v_expires_in_days integer;
  v_existing_user_id uuid;
  v_invitation public.property_member_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  if p_property_id is null or v_role not in ('owner', 'manager') then
    raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'property_id and a valid role are required';
  end if;

  if not exists (select 1 from public.properties where id = p_property_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'Property not found';
  end if;

  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Managers may manage ordinary invitations, but only an owner can grant
  -- another account ownership of the property.
  if v_role = 'owner'
    and not public.is_admin_l1()
    and not exists (
      select 1 from public.property_members
      where property_id = p_property_id
        and user_id = v_uid
        and role = 'owner'
        and status = 'active'
    )
    and not exists (
      select 1 from public.property_owners
      where property_id = p_property_id and user_id = v_uid
    )
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Only an owner can invite another owner';
  end if;

  if exists (
    select 1 from public.properties
    where id = p_property_id and lifecycle_status = 'archived'
  ) then
    raise exception 'CONFLICT' using errcode = 'P0001', detail = 'Cannot invite a member to an archived property';
  end if;

  v_email := nullif(lower(btrim(p_email)), '');
  v_phone := nullif(regexp_replace(coalesce(btrim(p_phone), ''), '[^0-9]', '', 'g'), '');
  v_name := nullif(btrim(p_invitee_name), '');

  if v_email is null and v_phone is null then
    raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'email or phone is required';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'email is invalid';
  end if;
  if v_phone is not null and length(v_phone) < 8 then
    raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'phone is invalid';
  end if;

  v_expires_in_days := least(greatest(coalesce(p_expires_in_days, 14), 1), 30);

  select u.id into v_existing_user_id
  from auth.users u
  where (v_email is not null and lower(coalesce(u.email, '')) = v_email)
     or (v_phone is not null and exists (
       select 1 from public.member_contact_phones cp
       where cp.user_id = u.id and cp.phone_normalized = v_phone
     ))
  order by u.created_at
  limit 1;

  if v_existing_user_id is not null and exists (
    select 1 from public.property_members
    where property_id = p_property_id
      and user_id = v_existing_user_id
      and status = 'active'
  ) then
    raise exception 'CONFLICT' using errcode = 'P0001', detail = 'User is already an active property member';
  end if;

  update public.property_member_invitations
  set status = 'revoked', revoked_by = v_uid, revoked_at = now(), updated_at = now()
  where property_id = p_property_id
    and status = 'pending'
    and ((v_email is not null and invited_email = v_email)
      or (v_phone is not null and invited_phone = v_phone));

  insert into public.property_member_invitations (
    property_id, token, invitee_name, invited_email, invited_phone, role,
    status, created_by, expires_at, created_at, updated_at
  ) values (
    p_property_id, gen_random_uuid(), v_name, v_email, v_phone, v_role,
    'pending', v_uid, now() + make_interval(days => v_expires_in_days), now(), now()
  ) returning * into v_invitation;

  return jsonb_build_object('ok', true, 'invitation', to_jsonb(v_invitation));
end;
$function$;

create or replace function public.accept_property_member_invitation_v1(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_user_email text;
  v_user_phone text;
  v_invitation public.property_member_invitations%rowtype;
  v_member public.property_members%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_token is null then raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'token is required'; end if;

  select * into v_invitation
  from public.property_member_invitations
  where token = p_token
  for update;

  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'Invitation not found'; end if;
  if v_invitation.status <> 'pending' then raise exception 'CONFLICT' using errcode = 'P0001', detail = 'Invitation is no longer pending'; end if;
  if v_invitation.expires_at <= now() then raise exception 'CONFLICT' using errcode = 'P0001', detail = 'Invitation has expired'; end if;
  if v_invitation.role not in ('owner', 'manager') then raise exception 'INVALID_INPUT' using errcode = '22023', detail = 'Invitation role is invalid'; end if;
  if exists (select 1 from public.properties where id = v_invitation.property_id and lifecycle_status = 'archived') then
    raise exception 'CONFLICT' using errcode = 'P0001', detail = 'Property is archived';
  end if;

  select nullif(lower(btrim(email)), '') into v_user_email
  from auth.users where id = v_uid;

  select cp.phone_normalized into v_user_phone
  from public.member_contact_phones cp
  where cp.user_id = v_uid and cp.is_verified = true
  order by cp.is_primary desc, cp.created_at
  limit 1;

  if not ((v_invitation.invited_email is not null and v_user_email = v_invitation.invited_email)
    or (v_invitation.invited_phone is not null and v_user_phone = v_invitation.invited_phone)) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'Invitation does not match the signed-in account';
  end if;

  insert into public.property_members (
    property_id, user_id, role, status, created_by, created_at, updated_at
  ) values (
    v_invitation.property_id, v_uid, v_invitation.role, 'active',
    v_invitation.created_by, now(), now()
  )
  on conflict (property_id, user_id) do update set
    role = case when property_members.role = 'owner' then 'owner' else excluded.role end,
    status = 'active',
    updated_at = now()
  returning * into v_member;

  if v_member.role = 'owner' then
    insert into public.property_owners (property_id, user_id, created_at)
    values (v_invitation.property_id, v_uid, now())
    on conflict (property_id, user_id) do nothing;
  end if;

  update public.property_member_invitations
  set status = 'accepted', accepted_by = v_uid, accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'ok', true,
    'property_id', v_invitation.property_id,
    'role', v_member.role,
    'member', to_jsonb(v_member)
  );
end;
$function$;

revoke all on function public.invite_owner_property_member_v2(uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.invite_owner_property_member_v2(uuid, text, text, text, text, integer) to authenticated, service_role;

revoke all on function public.accept_property_member_invitation_v1(uuid) from public, anon;
grant execute on function public.accept_property_member_invitation_v1(uuid) to authenticated, service_role;

commit;
