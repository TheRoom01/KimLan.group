CREATE OR REPLACE FUNCTION public.submit_room_consult_request_v1(p_request_key uuid, p_room_id uuid, p_guest_name text, p_guest_phone text, p_request_type text, p_viewing_date date DEFAULT NULL::date, p_preferred_time text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(request_id uuid, duplicate boolean, notified_admins integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from (
    select unnest(v_recipients) as recipient_id
    union
    -- This L1 account also follows requests routed to a room's own team.
    select au.user_id
    from public.admin_users au
    join auth.users u on u.id = au.user_id
    where au.level = 1
      and lower(u.email) = 'danhcatkhanh@gmail.com'
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) as recipients;

  get diagnostics v_notify_count = row_count;
  return query select v_request_id, false, v_notify_count;
end;
$function$;
