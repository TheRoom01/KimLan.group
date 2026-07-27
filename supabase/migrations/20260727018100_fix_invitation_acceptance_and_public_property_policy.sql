begin;

drop policy if exists properties_public_select_approved
on public.properties;

create policy properties_public_select_approved
on public.properties
as permissive
for select
to anon, authenticated
using (
  approval_status = 'approved'
  and lifecycle_status = 'active'
);

create or replace function public.accept_property_member_invitation_v1(
  p_token uuid
)
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
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_token is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'token is required';
  end if;

  select i.*
  into v_invitation
  from public.property_member_invitations i
  where i.token = p_token
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Invitation not found';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Invitation is no longer pending';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Invitation has expired';
  end if;

  if exists (
    select 1
    from public.properties p
    where p.id = v_invitation.property_id
      and p.lifecycle_status = 'archived'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Property is archived';
  end if;

  select
    nullif(lower(btrim(u.email)), ''),
    nullif(
      regexp_replace(
        coalesce(u.phone, ''),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    )
  into
    v_user_email,
    v_user_phone
  from auth.users u
  where u.id = v_uid;

  if not (
    (
      v_invitation.invited_email is not null
      and v_user_email = v_invitation.invited_email
    )
    or
    (
      v_invitation.invited_phone is not null
      and v_user_phone = v_invitation.invited_phone
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN',
      detail = 'Invitation does not match the signed-in account';
  end if;

  insert into public.property_members (
    property_id,
    user_id,
    role,
    status,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_invitation.property_id,
    v_uid,
    'manager',
    'active',
    v_invitation.created_by,
    now(),
    now()
  )
  on conflict (property_id, user_id)
  do update set
    role = case
      when property_members.role = 'owner'
        then 'owner'
      else 'manager'
    end,
    status = 'active',
    updated_at = now()
  returning *
  into v_member;

  update public.property_member_invitations
  set
    status = 'accepted',
    accepted_by = v_uid,
    accepted_at = now(),
    updated_at = now()
  where id = v_invitation.id;

  return jsonb_build_object(
    'ok', true,
    'property_id', v_invitation.property_id,
    'member', to_jsonb(v_member)
  );
end;
$function$;

revoke all
on function public.accept_property_member_invitation_v1(uuid)
from public, anon;

grant execute
on function public.accept_property_member_invitation_v1(uuid)
to authenticated, service_role;

commit;
