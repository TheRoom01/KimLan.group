begin;

create or replace function public.get_owner_tenants_v1()
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
      tenant_row.data
      order by tenant_row.last_contract_created_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      max(rc.created_at) as last_contract_created_at,

      jsonb_build_object(
        'tenant',
        jsonb_build_object(
          'id', t.id,
          'full_name', t.full_name,
          'phone', t.phone,
          'cccd', t.cccd
        ),

        'contracts_count',
        count(distinct rc.id),

        'active_contract',
        (
          select jsonb_build_object(
            'id', arc.id,
            'status', arc.status,
            'start_date', arc.start_date,
            'end_date', arc.end_date,
            'monthly_price', arc.monthly_price,
            'deposit_amount', arc.deposit_amount,

            'room',
            jsonb_build_object(
              'id', ar.id,
              'room_code', ar.room_code,
              'room_type', ar.room_type
            ),

            'property',
            jsonb_build_object(
              'id', ap.id,
              'code', ap.code,

              'name',
              coalesce(
                nullif(btrim(ap.name), ''),
                nullif(
                  btrim(
                    concat_ws(
                      ' ',
                      nullif(btrim(ap.house_number), ''),
                      nullif(btrim(ap.address), ''),
                      nullif(btrim(ap.district), '')
                    )
                  ),
                  ''
                )
              ),

              'address',
              nullif(
                btrim(
                  concat_ws(
                    ', ',
                    nullif(btrim(ap.house_number), ''),
                    nullif(btrim(ap.address), ''),
                    nullif(btrim(ap.ward), ''),
                    nullif(btrim(ap.district), ''),
                    nullif(btrim(ap.city), '')
                  )
                ),
                ''
              )
            )
          )

          from public.contract_tenants act

          join public.rental_contracts arc
            on arc.id = act.contract_id

          join public.rooms ar
            on ar.id = arc.room_id

          join public.properties ap
            on ap.id = ar.property_id

          where act.tenant_id = t.id
            and act.role = 'Chủ hợp đồng'
            and public.can_view_property(ap.id)
            and arc.status in (
              'active',
              'pending',
              'Đang hiệu lực',
              'Chờ nhận phòng'
            )

          order by
            case
              when arc.status in (
                'active',
                'Đang hiệu lực'
              ) then 0
              else 1
            end,
            arc.start_date desc nulls last,
            arc.created_at desc nulls last

          limit 1
        )
      ) as data

    from public.tenants t

    join public.contract_tenants ct
      on ct.tenant_id = t.id

    join public.rental_contracts rc
      on rc.id = ct.contract_id

    join public.rooms r
      on r.id = rc.room_id

    join public.properties p
      on p.id = r.property_id

    where ct.role = 'Chủ hợp đồng'
      and public.can_view_property(p.id)

    group by
      t.id,
      t.full_name,
      t.phone,
      t.cccd
  ) tenant_row;

  return v_result;
end;
$function$;

revoke all
on function public.get_owner_tenants_v1()
from public, anon;

grant execute
on function public.get_owner_tenants_v1()
to authenticated, service_role;

commit;
