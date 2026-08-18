begin;

alter table public.rental_contracts
  add column if not exists contract_type text not null default 'lease',
  add column if not exists booking_status text,
  add column if not exists booking_total_amount numeric not null default 0;

alter table public.rental_contracts
  drop constraint if exists rental_contracts_contract_type_check,
  add constraint rental_contracts_contract_type_check check (contract_type in ('lease', 'deposit')),
  drop constraint if exists rental_contracts_booking_status_check,
  add constraint rental_contracts_booking_status_check check (booking_status is null or booking_status in ('holding', 'awaiting_checkin', 'checked_in', 'cancelled')),
  drop constraint if exists rental_contracts_booking_total_amount_check,
  add constraint rental_contracts_booking_total_amount_check check (booking_total_amount >= 0);

create index if not exists rental_contracts_deposit_checkin_idx
  on public.rental_contracts(start_date, booking_status)
  where contract_type = 'deposit' and deleted_at is null;

create unique index if not exists notifications_booking_deadline_once_idx
  on public.notifications(user_id, type, reference_id)
  where type in ('booking_checkin_tomorrow', 'booking_checkin_overdue');

create or replace function public.configure_owner_booking_deposit_v1(p_contract_id uuid, p_contract_type text, p_booking_total_amount numeric default 0)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare v_contract public.rental_contracts%rowtype;
begin
  if p_contract_type not in ('lease', 'deposit') then raise exception 'INVALID_CONTRACT_TYPE' using errcode = '22023'; end if;
  select * into v_contract from public.rental_contracts where id = p_contract_id and deleted_at is null for update;
  if not found then raise exception 'CONTRACT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_manage_room(v_contract.room_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.rental_contracts
  set contract_type = p_contract_type,
      booking_status = case when p_contract_type = 'deposit' then 'holding' else null end,
      booking_total_amount = case when p_contract_type = 'deposit' then greatest(coalesce(p_booking_total_amount, 0), deposit_amount) else 0 end
  where id = p_contract_id returning * into v_contract;
  return to_jsonb(v_contract);
end;
$function$;

revoke all on function public.configure_owner_booking_deposit_v1(uuid, text, numeric) from public, anon;
grant execute on function public.configure_owner_booking_deposit_v1(uuid, text, numeric) to authenticated, service_role;

create or replace function public.update_owner_booking_status_v1(p_contract_id uuid, p_booking_status text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare v_contract public.rental_contracts%rowtype;
begin
  if p_booking_status not in ('holding', 'awaiting_checkin', 'checked_in', 'cancelled') then
    raise exception 'INVALID_BOOKING_STATUS' using errcode = '22023';
  end if;
  select * into v_contract from public.rental_contracts
  where id = p_contract_id and contract_type = 'deposit' and deleted_at is null for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_manage_room(v_contract.room_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.rental_contracts set booking_status = p_booking_status,
    status = case when p_booking_status = 'cancelled' then 'cancelled' when p_booking_status = 'checked_in' then 'active' else status end
  where id = p_contract_id returning * into v_contract;
  return to_jsonb(v_contract);
end;
$function$;

revoke all on function public.update_owner_booking_status_v1(uuid, text) from public, anon;
grant execute on function public.update_owner_booking_status_v1(uuid, text) to authenticated, service_role;

create or replace function public.create_my_booking_deadline_notifications_v1()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_user_id uuid := auth.uid(); v_count integer := 0;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  insert into public.notifications(user_id, type, title, message, reference_id, reference_type)
  select v_user_id,
    case when rc.start_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then 'booking_checkin_tomorrow' else 'booking_checkin_overdue' end,
    case when rc.start_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 then 'Đặt cọc sắp đến hạn check-in' else 'Đặt cọc đã quá hạn check-in' end,
    concat('Phòng ', coalesce(r.room_code, '-'), ' · check-in ', to_char(rc.start_date, 'DD/MM/YYYY')),
    rc.id, 'booking_deposit'
  from public.rental_contracts rc join public.rooms r on r.id = rc.room_id
  where rc.contract_type = 'deposit' and rc.booking_status in ('holding', 'awaiting_checkin')
    and rc.deleted_at is null and rc.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1 and public.can_manage_room(rc.room_id)
  on conflict (user_id, type, reference_id) where type in ('booking_checkin_tomorrow', 'booking_checkin_overdue') do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.create_my_booking_deadline_notifications_v1() from public, anon;
grant execute on function public.create_my_booking_deadline_notifications_v1() to authenticated, service_role;

commit;
