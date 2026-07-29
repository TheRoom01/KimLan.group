begin;

create table if not exists public.owner_email_outbox (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  requester_user_id uuid not null,
  recipient_email text not null,
  template text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.owner_email_outbox enable row level security;

drop policy if exists owner_email_outbox_admin_read on public.owner_email_outbox;
create policy owner_email_outbox_admin_read on public.owner_email_outbox
for select to authenticated using (coalesce(public.is_admin_l1(), false));

create or replace function public.owner_phone_key_v1(p_phone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 9
      then right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 9)
    else null
  end;
$function$;

create or replace function public.resolve_duplicate_property_owner_v1(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_user_phone text;
  v_matches boolean := false;
  v_address text;
  v_owner_email text;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select public.owner_phone_key_v1(coalesce(
    nullif(u.phone, ''),
    nullif(u.raw_user_meta_data->>'phone', ''),
    nullif(u.raw_user_meta_data->>'zalo_phone', ''),
    nullif(u.raw_user_meta_data->>'contact_phone', '')
  )) into v_user_phone
  from auth.users u where u.id = v_uid;

  if v_user_phone is not null then
    select exists (
      select 1 from public.rooms r
      where r.property_id = p_property_id
        and r.lifecycle_status = 'active'
        and regexp_replace(coalesce(r.zalo_phone, ''), '[^0-9]', '', 'g') like '%' || v_user_phone || '%'
    ) into v_matches;
  end if;

  if v_matches then
    insert into public.property_members(property_id, user_id, role, status, created_by, created_at, updated_at)
    values (p_property_id, v_uid, 'owner', 'active', v_uid, now(), now())
    on conflict (property_id, user_id) do update
      set role = 'owner', status = 'active', updated_at = now();

    insert into public.property_owners(property_id, user_id, created_at)
    values (p_property_id, v_uid, now())
    on conflict (property_id, user_id) do nothing;

    update public.property_join_requests
      set status = 'approved'
      where property_id = p_property_id and requester_user_id = v_uid and status = 'pending';

    return jsonb_build_object('mode', 'owner_recovered', 'property_id', p_property_id);
  end if;

  select concat_ws(', ', p.house_number, p.address, p.ward, p.district, p.city)
    into v_address from public.properties p where p.id = p_property_id;

  select u.email into v_owner_email
  from public.property_members pm
  join auth.users u on u.id = pm.user_id
  where pm.property_id = p_property_id and pm.role = 'owner' and pm.status = 'active'
  order by pm.created_at limit 1;

  select id into v_request_id from public.property_join_requests
  where property_id = p_property_id and requester_user_id = v_uid and status = 'pending'
  order by created_at desc limit 1;

  if v_owner_email is not null and not exists (
    select 1 from public.owner_email_outbox
    where property_id = p_property_id and requester_user_id = v_uid
      and recipient_email = v_owner_email and status in ('pending', 'sending', 'sent')
  ) then
    insert into public.owner_email_outbox(property_id, requester_user_id, recipient_email, template, subject, payload)
    values (p_property_id, v_uid, v_owner_email, 'property_owner_change_confirmation',
      'Xác nhận yêu cầu thay đổi chủ tòa nhà',
      jsonb_build_object('property_id', p_property_id, 'request_id', v_request_id, 'address', v_address));
  end if;

  if not exists (
    select 1 from public.owner_email_outbox
    where property_id = p_property_id and requester_user_id = v_uid
      and recipient_email = 'voduongngoclan@gmail.com' and status in ('pending', 'sending', 'sent')
  ) then
    insert into public.owner_email_outbox(property_id, requester_user_id, recipient_email, template, subject, payload)
    values (p_property_id, v_uid, 'voduongngoclan@gmail.com', 'property_owner_phone_review',
      'Admin L1: yêu cầu xác minh đổi SĐT chủ tòa nhà',
      jsonb_build_object('property_id', p_property_id, 'request_id', v_request_id, 'address', v_address,
        'requester_phone_key', v_user_phone));
  end if;

  return jsonb_build_object('mode', 'verification_pending', 'property_id', p_property_id, 'request_id', v_request_id);
end;
$function$;

revoke all on function public.owner_phone_key_v1(text) from public, anon;
revoke all on function public.resolve_duplicate_property_owner_v1(uuid) from public, anon;
grant execute on function public.resolve_duplicate_property_owner_v1(uuid) to authenticated, service_role;

commit;
