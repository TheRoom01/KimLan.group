begin;

-- Pending properties must not be visible through the public policy.
drop policy if exists "Allow read properties"
on public.properties;

create policy properties_public_select_approved
on public.properties
as permissive
for select
to anon
using (
  approval_status = 'approved'
  and lifecycle_status = 'active'
);


create table if not exists public.property_member_invitations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references public.properties(id)
    on delete cascade,
  token uuid not null default gen_random_uuid(),
  invitee_name text,
  invited_email text,
  invited_phone text,
  role text not null default 'manager',
  status text not null default 'pending',
  created_by uuid not null
    references auth.users(id)
    on delete cascade,
  accepted_by uuid
    references auth.users(id)
    on delete set null,
  revoked_by uuid
    references auth.users(id)
    on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint property_member_invitations_token_key
    unique (token),

  constraint property_member_invitations_identifier_chk
    check (
      invited_email is not null
      or invited_phone is not null
    ),

  constraint property_member_invitations_role_chk
    check (role = 'manager'),

  constraint property_member_invitations_status_chk
    check (
      status in (
        'pending',
        'accepted',
        'revoked',
        'expired'
      )
    ),

  constraint property_member_invitations_email_normalized_chk
    check (
      invited_email is null
      or invited_email = lower(btrim(invited_email))
    ),

  constraint property_member_invitations_phone_normalized_chk
    check (
      invited_phone is null
      or invited_phone ~ '^[0-9]+$'
    ),

  constraint property_member_invitations_expiry_chk
    check (expires_at > created_at),

  constraint property_member_invitations_acceptance_chk
    check (
      (status = 'accepted' and accepted_by is not null and accepted_at is not null)
      or
      (status <> 'accepted')
    ),

  constraint property_member_invitations_revocation_chk
    check (
      (status = 'revoked' and revoked_by is not null and revoked_at is not null)
      or
      (status <> 'revoked')
    )
);

create index if not exists property_member_invitations_property_idx
on public.property_member_invitations (
  property_id,
  created_at desc
);

create index if not exists property_member_invitations_status_expiry_idx
on public.property_member_invitations (
  status,
  expires_at
);

create unique index if not exists property_member_invitations_pending_email_key
on public.property_member_invitations (
  property_id,
  lower(invited_email)
)
where status = 'pending'
  and invited_email is not null;

create unique index if not exists property_member_invitations_pending_phone_key
on public.property_member_invitations (
  property_id,
  invited_phone
)
where status = 'pending'
  and invited_phone is not null;

alter table public.property_member_invitations
enable row level security;

drop policy if exists property_member_invitations_select_managers
on public.property_member_invitations;

create policy property_member_invitations_select_managers
on public.property_member_invitations
as permissive
for select
to authenticated
using (
  public.can_manage_property(property_id)
);

drop policy if exists property_member_invitations_admin_all
on public.property_member_invitations;

create policy property_member_invitations_admin_all
on public.property_member_invitations
as permissive
for all
to authenticated
using (
  public.is_admin_l1()
)
with check (
  public.is_admin_l1()
);

drop trigger if exists trg_property_member_invitations_updated_at
on public.property_member_invitations;

create trigger trg_property_member_invitations_updated_at
before update
on public.property_member_invitations
for each row
execute function public.set_updated_at();

revoke all
on table public.property_member_invitations
from public, anon;

grant select
on table public.property_member_invitations
to authenticated;

grant all
on table public.property_member_invitations
to service_role;


create or replace function public.invite_owner_property_manager_v1(
  p_property_id uuid,
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
  v_email text;
  v_phone text;
  v_name text;
  v_expires_in_days integer;
  v_existing_user_id uuid;
  v_invitation public.property_member_invitations%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id is required';
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

  if not public.can_manage_property(p_property_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
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
      detail = 'Cannot invite a manager to an archived property';
  end if;

  v_email := nullif(lower(btrim(p_email)), '');
  v_phone := nullif(
    regexp_replace(
      coalesce(btrim(p_phone), ''),
      '[^0-9]',
      '',
      'g'
    ),
    ''
  );
  v_name := nullif(btrim(p_invitee_name), '');

  if v_email is null and v_phone is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'email or phone is required';
  end if;

  if v_email is not null
    and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'email is invalid';
  end if;

  if v_phone is not null
    and length(v_phone) < 8
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'phone is invalid';
  end if;

  v_expires_in_days := least(
    greatest(coalesce(p_expires_in_days, 14), 1),
    30
  );

  select u.id
  into v_existing_user_id
  from auth.users u
  where (
      v_email is not null
      and lower(coalesce(u.email, '')) = v_email
    )
    or (
      v_phone is not null
      and regexp_replace(
        coalesce(u.phone, ''),
        '[^0-9]',
        '',
        'g'
      ) = v_phone
    )
  order by u.created_at
  limit 1;

  if v_existing_user_id is not null
    and exists (
      select 1
      from public.property_members pm
      where pm.property_id = p_property_id
        and pm.user_id = v_existing_user_id
        and pm.status = 'active'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'User is already an active property member';
  end if;

  update public.property_member_invitations i
  set
    status = 'revoked',
    revoked_by = v_uid,
    revoked_at = now(),
    updated_at = now()
  where i.property_id = p_property_id
    and i.status = 'pending'
    and (
      (v_email is not null and i.invited_email = v_email)
      or
      (v_phone is not null and i.invited_phone = v_phone)
    );

  insert into public.property_member_invitations (
    property_id,
    token,
    invitee_name,
    invited_email,
    invited_phone,
    role,
    status,
    created_by,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_property_id,
    gen_random_uuid(),
    v_name,
    v_email,
    v_phone,
    'manager',
    'pending',
    v_uid,
    now() + make_interval(days => v_expires_in_days),
    now(),
    now()
  )
  returning *
  into v_invitation;

  return jsonb_build_object(
    'ok', true,
    'invitation', to_jsonb(v_invitation)
  );
end;
$function$;


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
    role = 'manager',
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


create or replace function public.revoke_owner_property_invitation_v1(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_invitation public.property_member_invitations%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_invitation_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'invitation_id is required';
  end if;

  select i.*
  into v_invitation
  from public.property_member_invitations i
  where i.id = p_invitation_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Invitation not found';
  end if;

  if not public.can_manage_property(v_invitation.property_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'CONFLICT',
      detail = 'Only pending invitations can be revoked';
  end if;

  update public.property_member_invitations
  set
    status = 'revoked',
    revoked_by = v_uid,
    revoked_at = now(),
    updated_at = now()
  where id = p_invitation_id
  returning *
  into v_invitation;

  return jsonb_build_object(
    'ok', true,
    'invitation', to_jsonb(v_invitation)
  );
end;
$function$;


create or replace function public.get_owner_property_invitations_v1(
  p_property_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_property_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id is required';
  end if;

  if not public.can_manage_property(p_property_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'property_id', i.property_id,
        'token', i.token,
        'invitee_name', i.invitee_name,
        'invited_email', i.invited_email,
        'invited_phone', i.invited_phone,
        'role', i.role,
        'status', case
          when i.status = 'pending'
            and i.expires_at <= now()
            then 'expired'
          else i.status
        end,
        'created_by', i.created_by,
        'accepted_by', i.accepted_by,
        'revoked_by', i.revoked_by,
        'expires_at', i.expires_at,
        'accepted_at', i.accepted_at,
        'revoked_at', i.revoked_at,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      )
      order by i.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.property_member_invitations i
  where i.property_id = p_property_id;

  return v_result;
end;
$function$;


revoke all
on function public.invite_owner_property_manager_v1(
  uuid,
  text,
  text,
  text,
  integer
)
from public, anon;

revoke all
on function public.accept_property_member_invitation_v1(uuid)
from public, anon;

revoke all
on function public.revoke_owner_property_invitation_v1(uuid)
from public, anon;

revoke all
on function public.get_owner_property_invitations_v1(uuid)
from public, anon;

grant execute
on function public.invite_owner_property_manager_v1(
  uuid,
  text,
  text,
  text,
  integer
)
to authenticated, service_role;

grant execute
on function public.accept_property_member_invitation_v1(uuid)
to authenticated, service_role;

grant execute
on function public.revoke_owner_property_invitation_v1(uuid)
to authenticated, service_role;

grant execute
on function public.get_owner_property_invitations_v1(uuid)
to authenticated, service_role;

commit;
