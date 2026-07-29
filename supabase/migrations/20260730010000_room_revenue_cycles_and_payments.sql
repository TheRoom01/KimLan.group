begin;

create table if not exists public.room_revenue_cycles (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),
 month integer not null check(month between 1 and 12), year integer not null check(year between 2000 and 2200),
 status text not null default 'open' check(status in('open','closed')), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(property_id,month,year)
);

create table if not exists public.room_monthly_revenues (
 id uuid primary key default gen_random_uuid(), cycle_id uuid references public.room_revenue_cycles(id),
 property_id uuid not null references public.properties(id), room_id uuid not null references public.rooms(id),
 contract_id uuid not null references public.rental_contracts(id), revenue_month date, room_code text, tenant_name text,
 deposit_amount numeric not null default 0, rent_amount numeric not null default 0,
 electricity_start numeric not null default 0, electricity_end numeric not null default 0,
 electricity_unit_price numeric not null default 0,
 electricity_amount numeric generated always as ((electricity_end-electricity_start)*electricity_unit_price) stored,
 parking_fee numeric not null default 0, service_fee numeric not null default 0,
 water_fee numeric not null default 0, other_fee numeric not null default 0,
 total_amount numeric generated always as (rent_amount+((electricity_end-electricity_start)*electricity_unit_price)+parking_fee+service_fee+water_fee+other_fee) stored,
 status text default 'draft', payment_status text not null default 'pending', paid_amount numeric not null default 0,
 paid_at timestamptz, payment_method text, note text, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint room_monthly_revenues_contract_cycle_key unique(contract_id,cycle_id)
);

alter table public.room_monthly_revenues
 drop constraint if exists room_monthly_revenues_contract_month_key,
 alter column revenue_month drop not null,
 add column if not exists cycle_id uuid references public.room_revenue_cycles(id),
 add column if not exists tenant_name text,
 add column if not exists parking_fee numeric not null default 0,
 add column if not exists payment_status text not null default 'pending',
 add column if not exists paid_amount numeric not null default 0,
 add column if not exists paid_at timestamptz,
 add column if not exists payment_method text;
alter table public.room_monthly_revenues drop column if exists total_revenue;
alter table public.room_monthly_revenues add column if not exists electricity_amount numeric generated always as ((electricity_end-electricity_start)*electricity_unit_price) stored;
alter table public.room_monthly_revenues add column if not exists total_amount numeric generated always as (rent_amount+((electricity_end-electricity_start)*electricity_unit_price)+parking_fee+service_fee+water_fee+other_fee) stored;
alter table public.room_monthly_revenues drop constraint if exists room_monthly_revenues_status_check;
alter table public.room_monthly_revenues drop constraint if exists room_monthly_revenues_payment_status_check;
alter table public.room_monthly_revenues add constraint room_monthly_revenues_payment_status_check check(payment_status in('pending','partial','paid'));
alter table public.room_monthly_revenues drop constraint if exists room_monthly_revenues_payment_method_check;
alter table public.room_monthly_revenues add constraint room_monthly_revenues_payment_method_check check(payment_method is null or payment_method in('cash','bank_transfer','other'));
alter table public.room_monthly_revenues drop constraint if exists room_monthly_revenues_contract_cycle_key;
alter table public.room_monthly_revenues add constraint room_monthly_revenues_contract_cycle_key unique(contract_id,cycle_id);

create table if not exists public.room_payment_transactions (
 id uuid primary key default gen_random_uuid(), revenue_id uuid not null references public.room_monthly_revenues(id) on delete cascade,
 amount numeric not null check(amount>0), payment_method text not null check(payment_method in('cash','bank_transfer','other')),
 paid_at timestamptz not null default now(), created_by uuid not null references auth.users(id), note text, created_at timestamptz not null default now()
);

alter table public.room_revenue_cycles enable row level security;
alter table public.room_monthly_revenues enable row level security;
alter table public.room_payment_transactions enable row level security;
drop policy if exists monthly_revenues_owner_all on public.room_monthly_revenues;
create policy monthly_revenues_owner_all on public.room_monthly_revenues for all to authenticated
 using(public.can_archive_property(property_id)) with check(public.can_archive_property(property_id) and (created_by is null or created_by=auth.uid()));
drop policy if exists revenue_cycles_owner_all on public.room_revenue_cycles;
create policy revenue_cycles_owner_all on public.room_revenue_cycles for all to authenticated using(public.can_archive_property(property_id)) with check(public.can_archive_property(property_id) and created_by=auth.uid());
drop policy if exists payment_transactions_owner_select on public.room_payment_transactions;
create policy payment_transactions_owner_select on public.room_payment_transactions for select to authenticated using(exists(select 1 from public.room_monthly_revenues r where r.id=revenue_id and public.can_archive_property(r.property_id)));
drop policy if exists payment_transactions_owner_insert on public.room_payment_transactions;
create policy payment_transactions_owner_insert on public.room_payment_transactions for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.room_monthly_revenues r where r.id=revenue_id and public.can_archive_property(r.property_id)));

create or replace function public.record_room_payment_v1(p_revenue_id uuid,p_amount numeric,p_method text,p_paid_at timestamptz default now(),p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_uid uuid:=auth.uid();v_revenue public.room_monthly_revenues%rowtype;v_tx public.room_payment_transactions%rowtype;v_paid numeric;
begin
 if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='42501';end if;
 select * into v_revenue from public.room_monthly_revenues where id=p_revenue_id for update;
 if v_revenue.id is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if not public.can_archive_property(v_revenue.property_id) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_amount<=0 or p_method not in('cash','bank_transfer','other') then raise exception 'INVALID_INPUT' using errcode='22023';end if;
 insert into public.room_payment_transactions(revenue_id,amount,payment_method,paid_at,created_by,note)
 values(p_revenue_id,p_amount,p_method,coalesce(p_paid_at,now()),v_uid,nullif(btrim(p_note),'')) returning * into v_tx;
 select coalesce(sum(amount),0) into v_paid from public.room_payment_transactions where revenue_id=p_revenue_id;
 update public.room_monthly_revenues set paid_amount=v_paid,payment_status=case when v_paid<=0 then 'pending' when v_paid<total_amount then 'partial' else 'paid' end,
  paid_at=case when v_paid>=total_amount then coalesce(p_paid_at,now()) else null end,payment_method=p_method where id=p_revenue_id;
 return jsonb_build_object('transaction',to_jsonb(v_tx),'paid_amount',v_paid);
end;$function$;

grant select,insert,update,delete on public.room_revenue_cycles,public.room_monthly_revenues,public.room_payment_transactions to authenticated,service_role;
revoke all on function public.record_room_payment_v1(uuid,numeric,text,timestamptz,text) from public,anon;
grant execute on function public.record_room_payment_v1(uuid,numeric,text,timestamptz,text) to authenticated,service_role;
commit;
