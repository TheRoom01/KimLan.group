begin;

drop policy if exists monthly_revenues_owner_all on public.room_monthly_revenues;
create policy monthly_revenues_owner_all on public.room_monthly_revenues for all to authenticated
 using(public.can_manage_property(property_id))
 with check(public.can_manage_property(property_id) and (created_by is null or created_by=auth.uid()));

drop policy if exists revenue_cycles_owner_all on public.room_revenue_cycles;
create policy revenue_cycles_owner_all on public.room_revenue_cycles for all to authenticated
 using(public.can_manage_property(property_id))
 with check(public.can_manage_property(property_id) and created_by=auth.uid());

drop policy if exists payment_transactions_owner_select on public.room_payment_transactions;
create policy payment_transactions_owner_select on public.room_payment_transactions for select to authenticated
 using(exists(select 1 from public.room_monthly_revenues r where r.id=revenue_id and public.can_manage_property(r.property_id)));

drop policy if exists payment_transactions_owner_insert on public.room_payment_transactions;
create policy payment_transactions_owner_insert on public.room_payment_transactions for insert to authenticated
 with check(created_by=auth.uid() and exists(select 1 from public.room_monthly_revenues r where r.id=revenue_id and public.can_manage_property(r.property_id)));

create or replace function public.record_room_payment_v1(p_revenue_id uuid,p_amount numeric,p_method text,p_paid_at timestamptz default now(),p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_uid uuid:=auth.uid();v_revenue public.room_monthly_revenues%rowtype;v_tx public.room_payment_transactions%rowtype;v_paid numeric;
begin
 if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='42501';end if;
 select * into v_revenue from public.room_monthly_revenues where id=p_revenue_id for update;
 if v_revenue.id is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if not public.can_manage_property(v_revenue.property_id) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_amount<=0 or p_method not in('cash','bank_transfer','other') then raise exception 'INVALID_INPUT' using errcode='22023';end if;
 insert into public.room_payment_transactions(revenue_id,amount,payment_method,paid_at,created_by,note)
 values(p_revenue_id,p_amount,p_method,coalesce(p_paid_at,now()),v_uid,nullif(btrim(p_note),'')) returning * into v_tx;
 select coalesce(sum(amount),0) into v_paid from public.room_payment_transactions where revenue_id=p_revenue_id;
 update public.room_monthly_revenues set paid_amount=v_paid,payment_status=case when v_paid<=0 then 'pending' when v_paid<total_amount then 'partial' else 'paid' end,
  paid_at=case when v_paid>=total_amount then coalesce(p_paid_at,now()) else null end,payment_method=p_method where id=p_revenue_id;
 return jsonb_build_object('transaction',to_jsonb(v_tx),'paid_amount',v_paid);
end;$function$;

commit;
