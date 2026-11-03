-- General consultation support; safe to reapply when schema was provisioned separately.
begin;

alter table public.room_consult_requests
  add column if not exists consultation_kind text not null default 'room_consultation'
    check (consultation_kind in ('room_consultation', 'general_consultation')),
  add column if not exists referral_source text check (referral_source is null or referral_source in ('Facebook','TikTok','Threads','Người quen giới thiệu','Khác')),
  add column if not exists referral_detail text check (referral_detail is null or char_length(referral_detail) <= 300),
  alter column room_code_snapshot drop not null;

do $migration$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.room_consult_requests'::regclass and conname = 'general_consultation_without_room') then
    alter table public.room_consult_requests add constraint general_consultation_without_room check (
  consultation_kind <> 'general_consultation' or (
    room_id is null and property_id is null and room_code_snapshot is null
    and room_type_snapshot is null and address_snapshot is null and price_snapshot is null
    and request_type = 'consultation' and viewing_date is null and preferred_time is null
  )
);
  end if;
end;
$migration$;

create or replace function public.submit_general_consult_request_v1(
  p_request_key uuid, p_guest_name text, p_guest_phone text, p_notes text default null,
  p_referral_source text default null, p_referral_detail text default null
) returns table (request_id uuid, duplicate boolean, notified_admins integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_name text := btrim(coalesce(p_guest_name, ''));
  v_phone text := btrim(coalesce(p_guest_phone, ''));
  v_digits text := regexp_replace(coalesce(p_guest_phone, ''), '[^0-9]', '', 'g');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_source text := nullif(btrim(coalesce(p_referral_source, '')), '');
  v_detail text := nullif(btrim(coalesce(p_referral_detail, '')), '');
  v_admin uuid; v_id uuid; v_count integer;
begin
  if left(v_digits, 2) = '84' then v_digits := '0' || substr(v_digits, 3); end if;
  if p_request_key is null or char_length(v_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if char_length(v_phone) > 24 or v_phone !~ '^[+0-9(). -]+$' or v_digits !~ '^(0[35789][0-9]{8}|02[0-9]{9})$' then
    raise exception using errcode = '22023', message = 'INVALID_PHONE';
  end if;
  if char_length(v_notes) > 2000 or char_length(v_detail) > 300 or (v_source is not null and v_source not in ('Facebook','TikTok','Threads','Người quen giới thiệu','Khác')) then
    raise exception using errcode = '22023', message = 'INVALID_REFERRAL_OR_NOTES';
  end if;
  -- Same lock/rate limit as room requests; repeated clicks are serialized.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('room-consult-phone:' || v_digits, 0));
  select q.id into v_id from public.room_consult_requests q
    where q.request_key = p_request_key and q.guest_phone_normalized = v_digits and q.consultation_kind = 'general_consultation';
  if found then return query select v_id, true, 0; return; end if;
  if exists(select 1 from public.room_consult_requests q where q.request_key = p_request_key) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_KEY';
  end if;
  select q.id into v_id from public.room_consult_requests q
    where q.consultation_kind = 'general_consultation' and q.guest_phone_normalized = v_digits
      and q.created_at > now() - interval '2 minutes'
    order by q.created_at desc limit 1;
  if found then return query select v_id, true, 0; return; end if;
  select count(*) into v_count from public.room_consult_requests q
    where q.guest_phone_normalized = v_digits and q.created_at > now() - interval '1 hour';
  if v_count >= 10 then raise exception using errcode = 'P0001', message = 'RATE_LIMITED'; end if;

  -- Keep existing RLS: L1 sees all; a designated L2 can see their assigned requests.
  select au.user_id into v_admin from public.admin_users au where au.level in (1,2)
    order by au.level, au.user_id limit 1;
  if v_admin is null then raise exception using errcode = 'P0001', message = 'NO_ADMIN_RECIPIENT'; end if;
  insert into public.room_consult_requests (
    request_key, consultation_kind, room_id, assigned_admin_id, room_code_snapshot,
    guest_name, guest_phone, guest_phone_normalized, request_type, notes, referral_source, referral_detail
  ) values (
    p_request_key, 'general_consultation', null, v_admin, null,
    v_name, v_phone, v_digits, 'consultation', v_notes, v_source, v_detail
  ) returning id into v_id;

  insert into public.notifications(user_id,type,title,message,reference_id,reference_type)
    select au.user_id, 'room_consult_request', 'Yêu cầu tư vấn chung',
      'Khách ' || v_name || ' cần tư vấn tìm phòng', v_id, 'room_consult_request'
    from public.admin_users au where au.level = 1 or au.user_id = v_admin;
  get diagnostics v_count = row_count;
  return query select v_id, false, v_count;
end;
$function$;
revoke all on function public.submit_general_consult_request_v1(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_general_consult_request_v1(uuid,text,text,text,text,text) to service_role;
-- Existing RLS and table grants are preserved. No anonymous table access is added.
commit;
