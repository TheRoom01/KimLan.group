begin;

create or replace function public.get_owner_dashboard_v1(
  p_attention_limit integer default 5,
  p_activity_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_attention_limit integer := least(greatest(coalesce(p_attention_limit, 5), 1), 50);
  v_activity_limit integer := least(greatest(coalesce(p_activity_limit, 5), 1), 50);
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'total_properties',
      (
        select count(*)
        from public.properties p
        where public.can_view_property(p.id)
      ),

      'total_rooms',
      (
        select count(*)
        from public.rooms r
        join public.properties p
          on p.id = r.property_id
        where public.can_view_property(p.id)
      ),

      'rented_rooms',
      (
        select count(*)
        from public.rooms r
        join public.properties p
          on p.id = r.property_id
        where public.can_view_property(p.id)
          and r.status = 'Đã thuê'
      ),

      'empty_rooms',
      (
        select count(*)
        from public.rooms r
        join public.properties p
          on p.id = r.property_id
        where public.can_view_property(p.id)
          and r.status = 'Đang trống'
      ),

      'upcoming_rooms',
      (
        select count(*)
        from public.rooms r
        join public.properties p
          on p.id = r.property_id
        where public.can_view_property(p.id)
          and r.status = 'Sắp trống'
      )
    ),

    'recent_contracts',
    coalesce(
      (
        select jsonb_agg(
          recent_row.data
          order by recent_row.created_at desc nulls last
        )
        from (
          select
            rc.created_at,
            jsonb_build_object(
              'id', rc.id,
              'room', r.room_code,
              'room_id', r.id,
              'action', 'Tạo hợp đồng',
              'tenant', tenant_data.full_name,
              'tenant_id', tenant_data.id,
              'monthly_price', rc.monthly_price,
              'created_at', rc.created_at,
              'property', jsonb_build_object(
                'id', p.id,
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
                )
              )
            ) as data
          from public.rental_contracts rc
          join public.rooms r
            on r.id = rc.room_id
          join public.properties p
            on p.id = r.property_id
          left join lateral (
            select
              t.id,
              t.full_name
            from public.contract_tenants ct
            join public.tenants t
              on t.id = ct.tenant_id
            where ct.contract_id = rc.id
              and ct.role = 'Chủ hợp đồng'
            limit 1
          ) tenant_data
            on true
          where public.can_view_property(p.id)
          order by rc.created_at desc nulls last
          limit v_activity_limit
        ) recent_row
      ),
      '[]'::jsonb
    ),

    'expiring_contracts',
    coalesce(
      (
        select jsonb_agg(
          expiring_row.data
          order by expiring_row.end_date asc nulls last
        )
        from (
          select
            rc.end_date,
            jsonb_build_object(
              'id', rc.id,
              'room', r.room_code,
              'room_id', r.id,
              'tenant', tenant_data.full_name,
              'tenant_id', tenant_data.id,
              'end_date', rc.end_date,
              'property', jsonb_build_object(
                'id', p.id,
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
                )
              )
            ) as data
          from public.rental_contracts rc
          join public.rooms r
            on r.id = rc.room_id
          join public.properties p
            on p.id = r.property_id
          left join lateral (
            select
              t.id,
              t.full_name
            from public.contract_tenants ct
            join public.tenants t
              on t.id = ct.tenant_id
            where ct.contract_id = rc.id
              and ct.role = 'Chủ hợp đồng'
            limit 1
          ) tenant_data
            on true
          where public.can_view_property(p.id)
            and rc.status in (
              'active',
              'Đang hiệu lực'
            )
            and rc.end_date >= current_date
            and rc.end_date <= current_date + 30
          order by rc.end_date asc nulls last
          limit v_attention_limit
        ) expiring_row
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all
on function public.get_owner_dashboard_v1(integer, integer)
from public, anon;

grant execute
on function public.get_owner_dashboard_v1(integer, integer)
to authenticated, service_role;

commit;
