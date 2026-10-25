begin;

create table if not exists public.room_consult_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  room_id uuid references public.rooms(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  room_code_snapshot text not null,
  room_type_snapshot text,
  address_snapshot text,
  price_snapshot bigint,
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  guest_phone text not null check (char_length(guest_phone) between 8 and 24),
  guest_phone_normalized text not null,
  request_type text not null check (request_type in ('consultation', 'viewing')),
  viewing_date date,
  preferred_time text check (preferred_time is null or char_length(preferred_time) <= 80),
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_consult_viewing_date_check check (request_type <> 'viewing' or viewing_date is not null)
);

create index if not exists room_consult_requests_assignee_created_idx
  on public.room_consult_requests (assigned_admin_id, created_at desc);
create index if not exists room_consult_requests_property_created_idx
  on public.room_consult_requests (property_id, created_at desc);
create index if not exists room_consult_requests_created_idx
  on public.room_consult_requests (created_at desc);

alter table public.room_consult_requests enable row level security;
revoke all on public.room_consult_requests from public, anon, authenticated;
grant select on public.room_consult_requests to authenticated;
grant update (status, updated_at) on public.room_consult_requests to authenticated;
grant all on public.room_consult_requests to service_role;

drop policy if exists room_consult_requests_select_assigned on public.room_consult_requests;
create policy room_consult_requests_select_assigned on public.room_consult_requests
  for select to authenticated
  using (
    assigned_admin_id = (select auth.uid())
    or coalesce((select public.get_my_admin_level()), 0) = 1
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = room_consult_requests.property_id
        and pm.user_id = (select auth.uid())
        and pm.status = 'active'
        and pm.role in ('owner', 'manager')
    )
  );

drop policy if exists room_consult_requests_update_assigned on public.room_consult_requests;
create policy room_consult_requests_update_assigned on public.room_consult_requests
  for update to authenticated
  using (
    assigned_admin_id = (select auth.uid())
    or coalesce((select public.get_my_admin_level()), 0) = 1
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = room_consult_requests.property_id
        and pm.user_id = (select auth.uid())
        and pm.status = 'active'
        and pm.role in ('owner', 'manager')
    )
  )
  with check (
    assigned_admin_id = (select auth.uid())
    or coalesce((select public.get_my_admin_level()), 0) = 1
    or exists (
      select 1
      from public.property_members pm
      where pm.property_id = room_consult_requests.property_id
        and pm.user_id = (select auth.uid())
        and pm.status = 'active'
        and pm.role in ('owner', 'manager')
    )
  );

create or replace function public.submit_room_consult_request_v1(
  p_request_key uuid,
  p_room_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_request_type text,
  p_viewing_date date default null,
  p_preferred_time text default null,
  p_notes text default null
)
returns table (request_id uuid, duplicate boolean, notified_admins integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.rooms%rowtype;
  v_name text := btrim(coalesce(p_guest_name, ''));
  v_phone text := btrim(coalesce(p_guest_phone, ''));
  v_phone_normalized text := regexp_replace(coalesce(p_guest_phone, ''), '[^0-9]', '', 'g');
  v_request_type text := btrim(coalesce(p_request_type, ''));
  v_time text := nullif(btrim(coalesce(p_preferred_time, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_assigned_admin uuid;
  v_request_id uuid;
  v_recipients uuid[];
  v_notify_count integer := 0;
  v_recent_request_count integer := 0;
begin
  if p_request_key is null or p_room_id is null then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'INVALID_NAME';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 24 or char_length(v_phone_normalized) not between 9 and 14 then
    raise exception using errcode = '22023', message = 'INVALID_PHONE';
  end if;
  if v_request_type not in ('consultation', 'viewing') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_TYPE';
  end if;
  if v_request_type = 'viewing' and (p_viewing_date is null or p_viewing_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date) then
    raise exception using errcode = '22023', message = 'INVALID_VIEWING_DATE';
  end if;
  if v_time is not null and char_length(v_time) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_TIME';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_NOTES';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('room-consult-phone:' || v_phone_normalized, 0));

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
    and r.is_hidden = false
    and r.lifecycle_status = 'active'
    and r.publish_status = 'published';

  if not found then
    raise exception using errcode = 'P0002', message = 'ROOM_NOT_AVAILABLE';
  end if;

  select q.id into v_request_id
  from public.room_consult_requests q
  where q.request_key = p_request_key;
  if found then
    return query select v_request_id, true, 0;
    return;
  end if;

  select q.id into v_request_id
  from public.room_consult_requests q
  where q.room_id = p_room_id
    and q.guest_phone_normalized = v_phone_normalized
    and q.request_type = v_request_type
    and q.viewing_date is not distinct from p_viewing_date
    and q.created_at > now() - interval '2 minutes'
  order by q.created_at desc
  limit 1;
  if found then
    return query select v_request_id, true, 0;
    return;
  end if;

  select count(*)::integer into v_recent_request_count
  from public.room_consult_requests q
  where q.guest_phone_normalized = v_phone_normalized
    and q.created_at > now() - interval '1 hour';
  if v_recent_request_count >= 10 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  if v_room.owner_id is not null and exists (
    select 1 from public.admin_users au where au.user_id = v_room.owner_id and au.level in (1, 2)
  ) then
    v_assigned_admin := v_room.owner_id;
  elsif v_room.property_id is not null then
    select pm.user_id into v_assigned_admin
    from public.property_members pm
    where pm.property_id = v_room.property_id
      and pm.status = 'active'
      and pm.role in ('owner', 'manager')
    order by case pm.role when 'owner' then 0 else 1 end, pm.created_at asc
    limit 1;
  end if;

  select pg_catalog.array_agg(distinct recipient.user_id)
  into v_recipients
  from (
    select v_assigned_admin as user_id where v_assigned_admin is not null
    union
    select pm.user_id
    from public.property_members pm
    where pm.property_id = v_room.property_id
      and pm.status = 'active'
      and pm.role in ('owner', 'manager')
  ) recipient;

  if coalesce(pg_catalog.array_length(v_recipients, 1), 0) = 0 then
    select pg_catalog.array_agg(au.user_id)
    into v_recipients
    from public.admin_users au
    where au.level = 1;
  end if;

  if coalesce(pg_catalog.array_length(v_recipients, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'NO_ADMIN_RECIPIENT';
  end if;

  insert into public.room_consult_requests (
    request_key, room_id, property_id, assigned_admin_id,
    room_code_snapshot, room_type_snapshot, address_snapshot, price_snapshot,
    guest_name, guest_phone, guest_phone_normalized,
    request_type, viewing_date, preferred_time, notes
  ) values (
    p_request_key, v_room.id, v_room.property_id, v_assigned_admin,
    coalesce(nullif(btrim(v_room.room_code), ''), left(v_room.id::text, 8)),
    v_room.room_type,
    nullif(btrim(concat_ws(', ', v_room.house_number, v_room.address, v_room.ward, v_room.district)), ''),
    v_room.price,
    v_name, v_phone, v_phone_normalized,
    v_request_type, p_viewing_date, v_time, v_notes
  ) returning id into v_request_id;

  insert into public.notifications (user_id, type, title, message, reference_id, reference_type)
  select recipient_id,
    'room_consult_request',
    case when v_request_type = 'viewing' then 'Yêu cầu đặt lịch xem phòng' else 'Yêu cầu tư vấn phòng' end,
    'Khách ' || v_name || ' gửi yêu cầu cho phòng ' || coalesce(nullif(btrim(v_room.room_code), ''), left(v_room.id::text, 8)),
    v_request_id,
    'room_consult_request'
  from unnest(v_recipients) as recipients(recipient_id);

  get diagnostics v_notify_count = row_count;
  return query select v_request_id, false, v_notify_count;
end;
$function$;

revoke all on function public.submit_room_consult_request_v1(uuid, uuid, text, text, text, date, text, text) from public;
revoke all on function public.submit_room_consult_request_v1(uuid, uuid, text, text, text, date, text, text) from anon, authenticated;
grant execute on function public.submit_room_consult_request_v1(uuid, uuid, text, text, text, date, text, text) to service_role;

commit;
