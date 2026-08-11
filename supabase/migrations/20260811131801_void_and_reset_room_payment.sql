begin;

alter table public.room_payment_transactions
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text;

create or replace function public.record_room_payment_v1(
  p_revenue_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_revenue public.room_monthly_revenues%rowtype;
  v_tx public.room_payment_transactions%rowtype;
  v_paid numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;

  select * into v_revenue from public.room_monthly_revenues where id = p_revenue_id for update;
  if v_revenue.id is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_archive_property(v_revenue.property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_amount <= 0 or p_method not in ('cash', 'bank_transfer', 'other') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.room_payment_transactions(revenue_id, amount, payment_method, paid_at, created_by, note)
  values(p_revenue_id, p_amount, p_method, coalesce(p_paid_at, now()), v_uid, nullif(btrim(p_note), ''))
  returning * into v_tx;

  select coalesce(sum(amount), 0) into v_paid
  from public.room_payment_transactions
  where revenue_id = p_revenue_id and voided_at is null;

  update public.room_monthly_revenues
  set paid_amount = v_paid,
      payment_status = case when v_paid <= 0 then 'pending' when v_paid < total_amount then 'partial' else 'paid' end,
      paid_at = case when v_paid >= total_amount then coalesce(p_paid_at, now()) else null end,
      payment_method = p_method
  where id = p_revenue_id;

  return jsonb_build_object('transaction', to_jsonb(v_tx), 'paid_amount', v_paid);
end;
$function$;

create or replace function public.reset_room_payment_v1(p_revenue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_revenue public.room_monthly_revenues%rowtype;
  v_voided_count integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;

  select * into v_revenue from public.room_monthly_revenues where id = p_revenue_id for update;
  if v_revenue.id is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_archive_property(v_revenue.property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.room_payment_transactions
  set voided_at = now(),
      voided_by = v_uid,
      void_reason = 'Đặt lại trạng thái doanh thu về chưa thu'
  where revenue_id = p_revenue_id and voided_at is null;
  get diagnostics v_voided_count = row_count;

  update public.room_monthly_revenues
  set paid_amount = 0,
      payment_status = 'pending',
      paid_at = null,
      payment_method = null
  where id = p_revenue_id;

  return jsonb_build_object(
    'revenue_id', p_revenue_id,
    'voided_payments', v_voided_count,
    'paid_amount', 0,
    'payment_status', 'pending'
  );
end;
$function$;

revoke all on function public.reset_room_payment_v1(uuid) from public, anon;
grant execute on function public.reset_room_payment_v1(uuid) to authenticated, service_role;

commit;
