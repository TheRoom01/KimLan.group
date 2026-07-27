begin;

create or replace function public.get_owner_contracts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'status', rc.status,
        'start_date', rc.start_date,
        'end_date', rc.end_date,
        'monthly_price', rc.monthly_price,
        'deposit_amount', rc.deposit_amount,
        'created_at', rc.created_at,
        'room', jsonb_build_object(
          'id', r.id,
          'room_code', r.room_code,
          'room_type', r.room_type
        ),
        'property', jsonb_build_object(
          'id', p.id,
          'code', p.code,
          'name', coalesce(
            nullif(btrim(p.name), ''),
            nullif(
              btrim(
                concat_ws(
                  ' ',
                  nullif(btrim(p.house_number), ''),
                  nullif(btrim(p.address), ''),
                  nullif(btrim(p.district), '')
                )
              ),
              ''
            )
          ),
          'address', nullif(
            btrim(
              concat_ws(
                ', ',
                nullif(btrim(p.house_number), ''),
                nullif(btrim(p.address), ''),
                nullif(btrim(p.ward), ''),
                nullif(btrim(p.district), ''),
                nullif(btrim(p.city), '')
              )
            ),
            ''
          )
        ),
        'tenant', case
          when tenant_data.id is null then null
          else jsonb_build_object(
            'id', tenant_data.id,
            'full_name', tenant_data.full_name,
            'phone', tenant_data.phone,
            'cccd', tenant_data.cccd
          )
        end
      )
      order by rc.created_at desc nulls last, rc.start_date desc nulls last
    ),
    '[]'::jsonb
  )
  into v_result
  from public.rental_contracts rc
  join public.rooms r
    on r.id = rc.room_id
  join public.properties p
    on p.id = r.property_id
  left join lateral (
    select
      t.id,
      t.full_name,
      t.phone,
      t.cccd
    from public.contract_tenants ct
    join public.tenants t
      on t.id = ct.tenant_id
    where ct.contract_id = rc.id
      and ct.role = 'Chủ hợp đồng'
    limit 1
  ) tenant_data
    on true
  where public.can_view_property(p.id);

  return v_result;
end;
$function$;

revoke all
on function public.get_owner_contracts_v1()
from public, anon;

grant execute
on function public.get_owner_contracts_v1()
to authenticated, service_role;

commit;
