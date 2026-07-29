begin;

create table if not exists public.room_monthly_revenues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  room_id uuid not null references public.rooms(id),
  contract_id uuid not null references public.rental_contracts(id),
  revenue_month date not null,
  room_code text,
  deposit_amount numeric not null default 0,
  rent_amount numeric not null default 0,
  electricity_start numeric not null default 0,
  electricity_end numeric not null default 0,
  electricity_unit_price numeric not null default 0,
  water_fee numeric not null default 0,
  service_fee numeric not null default 0,
  other_fee numeric not null default 0,
  total_revenue numeric generated always as (
    rent_amount + ((electricity_end - electricity_start) * electricity_unit_price)
    + water_fee + service_fee + other_fee
  ) stored,
  note text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_monthly_revenues_contract_month_key unique(contract_id, revenue_month),
  constraint room_monthly_revenues_month_start_check check (revenue_month = date_trunc('month', revenue_month)::date),
  constraint room_monthly_revenues_non_negative_check check (
    deposit_amount >= 0 and rent_amount >= 0 and electricity_start >= 0 and electricity_end >= 0
    and electricity_unit_price >= 0 and water_fee >= 0 and service_fee >= 0 and other_fee >= 0
  ),
  constraint room_monthly_revenues_meter_check check (electricity_end >= electricity_start)
);

create index if not exists room_monthly_revenues_property_month_idx on public.room_monthly_revenues(property_id, revenue_month desc);
create index if not exists room_monthly_revenues_room_month_idx on public.room_monthly_revenues(room_id, revenue_month desc);
alter table public.room_monthly_revenues enable row level security;

create or replace function public.room_revenue_relation_valid_v1(p_property_id uuid, p_room_id uuid, p_contract_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $function$
  select exists (select 1 from public.rental_contracts rc join public.rooms r on r.id = rc.room_id
    where rc.id = p_contract_id and r.id = p_room_id and r.property_id = p_property_id);
$function$;

drop policy if exists room_monthly_revenues_owner_select on public.room_monthly_revenues;
create policy room_monthly_revenues_owner_select on public.room_monthly_revenues for select to authenticated
using (coalesce(public.is_admin_l1(), false) or exists (
  select 1 from public.property_members pm where pm.property_id = room_monthly_revenues.property_id
    and pm.user_id = auth.uid() and pm.role = 'owner' and pm.status = 'active'
));

drop policy if exists room_monthly_revenues_owner_insert on public.room_monthly_revenues;
create policy room_monthly_revenues_owner_insert on public.room_monthly_revenues for insert to authenticated
with check (created_by = auth.uid() and (coalesce(public.is_admin_l1(), false) or exists (
  select 1 from public.property_members pm where pm.property_id = room_monthly_revenues.property_id
    and pm.user_id = auth.uid() and pm.role = 'owner' and pm.status = 'active'
)) and public.room_revenue_relation_valid_v1(property_id, room_id, contract_id));

drop policy if exists room_monthly_revenues_owner_update on public.room_monthly_revenues;
create policy room_monthly_revenues_owner_update on public.room_monthly_revenues for update to authenticated
using (coalesce(public.is_admin_l1(), false) or exists (
  select 1 from public.property_members pm where pm.property_id = room_monthly_revenues.property_id
    and pm.user_id = auth.uid() and pm.role = 'owner' and pm.status = 'active'
)) with check ((coalesce(public.is_admin_l1(), false) or exists (
  select 1 from public.property_members pm where pm.property_id = room_monthly_revenues.property_id
    and pm.user_id = auth.uid() and pm.role = 'owner' and pm.status = 'active'
)) and public.room_revenue_relation_valid_v1(property_id, room_id, contract_id));

drop policy if exists room_monthly_revenues_owner_delete on public.room_monthly_revenues;
create policy room_monthly_revenues_owner_delete on public.room_monthly_revenues for delete to authenticated
using (coalesce(public.is_admin_l1(), false) or exists (
  select 1 from public.property_members pm where pm.property_id = room_monthly_revenues.property_id
    and pm.user_id = auth.uid() and pm.role = 'owner' and pm.status = 'active'
));

create or replace function public.touch_room_monthly_revenue_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  if tg_op = 'UPDATE' and (new.property_id, new.room_id, new.contract_id, new.revenue_month, new.created_by)
    is distinct from (old.property_id, old.room_id, old.contract_id, old.revenue_month, old.created_by) then
    raise exception 'IMMUTABLE_REVENUE_IDENTITY' using errcode = '22023';
  end if;
  if not public.room_revenue_relation_valid_v1(new.property_id, new.room_id, new.contract_id) then
    raise exception 'INVALID_REVENUE_RELATION' using errcode = '22023';
  end if;
  new.updated_at := now(); return new;
end;
$function$;
drop trigger if exists trg_touch_room_monthly_revenue on public.room_monthly_revenues;
create trigger trg_touch_room_monthly_revenue before insert or update on public.room_monthly_revenues
for each row execute function public.touch_room_monthly_revenue_updated_at();

revoke all on public.room_monthly_revenues from anon;
revoke all on function public.room_revenue_relation_valid_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.room_revenue_relation_valid_v1(uuid, uuid, uuid) to authenticated, service_role;
grant select, insert, update, delete on public.room_monthly_revenues to authenticated, service_role;
commit;
