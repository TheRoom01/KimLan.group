alter table public.properties
  add column if not exists gallery_images jsonb not null default '[]'::jsonb,
  add column if not exists google_maps_url text;

create or replace function public.update_owner_tenant_profile_v1(
  p_tenant_id uuid,
  p_full_name text,
  p_phone text default null,
  p_cccd text default null,
  p_date_of_birth date default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_tenant public.tenants%rowtype;
begin
  if not exists (
    select 1
    from public.contract_tenants ct
    join public.rental_contracts rc on rc.id = ct.contract_id
    where ct.tenant_id = p_tenant_id
      and public.can_manage_room(rc.room_id)
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  update public.tenants
  set full_name = btrim(p_full_name),
      phone = nullif(btrim(p_phone), ''),
      cccd = nullif(btrim(p_cccd), ''),
      date_of_birth = p_date_of_birth,
      address = nullif(btrim(p_address), '')
  where id = p_tenant_id
  returning * into v_tenant;

  if v_tenant.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return to_jsonb(v_tenant);
end;
$function$;

create or replace function public.delete_owner_tenant_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_name text;
begin
  if not exists (
    select 1
    from public.contract_tenants ct
    join public.rental_contracts rc on rc.id = ct.contract_id
    where ct.tenant_id = p_tenant_id
      and public.can_manage_room(rc.room_id)
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select full_name into v_name from public.tenants where id = p_tenant_id;
  delete from public.contract_tenants where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;

  return jsonb_build_object('ok', true, 'id', p_tenant_id, 'full_name', v_name);
end;
$function$;

revoke all on function public.update_owner_tenant_profile_v1(uuid, text, text, text, date, text) from public, anon;
revoke all on function public.delete_owner_tenant_v1(uuid) from public, anon;
grant execute on function public.update_owner_tenant_profile_v1(uuid, text, text, text, date, text) to authenticated, service_role;
grant execute on function public.delete_owner_tenant_v1(uuid) to authenticated, service_role;
