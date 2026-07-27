begin;

create or replace function public.get_owner_property_detail_v1(
  p_property_id uuid
)
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

  if p_property_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'property_id is required';
  end if;

  if not exists (
    select 1
    from public.properties p
    where p.id = p_property_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Property not found';
  end if;

  if not public.can_view_property(p_property_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'property',
    (
      select jsonb_build_object(
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
        'house_number', p.house_number,
        'address', p.address,
        'ward', p.ward,
        'district', p.district,
        'city', p.city,
        'full_address', nullif(
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
        ),
        'cover_image', p.cover_image,
        'approval_status', p.approval_status,
        'lifecycle_status', p.lifecycle_status,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.properties p
      where p.id = p_property_id
    ),

    'summary',
    (
      select jsonb_build_object(
        'total_rooms', count(*) filter (
          where coalesce(room_data.lifecycle_status, 'active') = 'active'
        ),
        'empty_rooms', count(*) filter (
          where coalesce(room_data.lifecycle_status, 'active') = 'active'
            and room_data.display_status = 'Đang trống'
        ),
        'rented_rooms', count(*) filter (
          where coalesce(room_data.lifecycle_status, 'active') = 'active'
            and room_data.display_status = 'Đã thuê'
        ),
        'upcoming_rooms', count(*) filter (
          where coalesce(room_data.lifecycle_status, 'active') = 'active'
            and room_data.display_status = 'Sắp trống'
        )
      )
      from (
        select
          r.lifecycle_status,
          case
            when active_contract.status in ('active', 'Đang hiệu lực') then
              case
                when active_contract.end_date between current_date and current_date + 30
                  then 'Sắp trống'
                else 'Đã thuê'
              end
            when active_contract.status in ('pending', 'Chờ nhận phòng')
              then 'Đã thuê'
            else coalesce(r.status, 'Đang trống')
          end as display_status
        from public.rooms r
        left join lateral (
          select
            rc.status,
            rc.end_date
          from public.rental_contracts rc
          where rc.room_id = r.id
            and rc.status in (
              'active',
              'pending',
              'Đang hiệu lực',
              'Chờ nhận phòng'
            )
          order by
            case
              when rc.status in ('active', 'Đang hiệu lực') then 0
              else 1
            end,
            rc.start_date desc nulls last,
            rc.created_at desc nulls last
          limit 1
        ) active_contract
          on true
        where r.property_id = p_property_id
      ) room_data
    ),

    'rooms',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', room_data.id,
            'room_code', room_data.room_code,
            'room_type', room_data.room_type,
            'price', room_data.price,
            'status', room_data.status,
            'lifecycle_status', room_data.lifecycle_status,
            'displayStatus', room_data.display_status,
            'daysRemaining', room_data.days_remaining,
            'contract', room_data.contract_data,
            'tenant', room_data.tenant_data
          )
          order by room_data.room_code nulls last
        ),
        '[]'::jsonb
      )
      from (
        select
          r.id,
          r.room_code,
          r.room_type,
          r.price,
          r.status,
          r.lifecycle_status,
          case
            when rc.status in ('active', 'Đang hiệu lực') then
              case
                when rc.end_date between current_date and current_date + 30
                  then 'Sắp trống'
                else 'Đã thuê'
              end
            when rc.status in ('pending', 'Chờ nhận phòng')
              then 'Đã thuê'
            else coalesce(r.status, 'Đang trống')
          end as display_status,
          case
            when rc.end_date is null or rc.end_date < current_date
              then null
            else rc.end_date - current_date
          end as days_remaining,
          case
            when rc.id is null then null
            else jsonb_build_object(
              'id', rc.id,
              'status', rc.status,
              'start_date', rc.start_date,
              'end_date', rc.end_date,
              'monthly_price', rc.monthly_price,
              'deposit_amount', rc.deposit_amount
            )
          end as contract_data,
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', t.id,
                  'full_name', t.full_name,
                  'phone', t.phone,
                  'cccd', t.cccd,
                  'role', ct.role
                )
                order by
                  case when ct.role = 'Chủ hợp đồng' then 0 else 1 end,
                  t.full_name
              )
              from public.contract_tenants ct
              join public.tenants t
                on t.id = ct.tenant_id
              where ct.contract_id = rc.id
            ),
            '[]'::jsonb
          ) as tenant_data
        from public.rooms r
        left join lateral (
          select
            rc.id,
            rc.status,
            rc.start_date,
            rc.end_date,
            rc.monthly_price,
            rc.deposit_amount,
            rc.created_at
          from public.rental_contracts rc
          where rc.room_id = r.id
            and rc.status in (
              'active',
              'pending',
              'Đang hiệu lực',
              'Chờ nhận phòng'
            )
          order by
            case
              when rc.status in ('active', 'Đang hiệu lực') then 0
              else 1
            end,
            rc.start_date desc nulls last,
            rc.created_at desc nulls last
          limit 1
        ) rc
          on true
        where r.property_id = p_property_id
      ) room_data
    ),

    'contracts',
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(c)
          order by c.created_at desc nulls last
        ),
        '[]'::jsonb
      )
      from public.owner_contract_overview c
      where c.property_id = p_property_id
    ),

    'tenants',
    (
      select coalesce(
        jsonb_agg(to_jsonb(t)),
        '[]'::jsonb
      )
      from public.owner_tenant_overview t
      where t.property_id = p_property_id
    ),

    'members',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'user_id', pm.user_id,
            'role', pm.role,
            'status', pm.status
          )
          order by
            case pm.role
              when 'owner' then 0
              when 'manager' then 1
              else 2
            end,
            pm.id
        ),
        '[]'::jsonb
      )
      from public.property_members pm
      where pm.property_id = p_property_id
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all
on function public.get_owner_property_detail_v1(uuid)
from public, anon;

grant execute
on function public.get_owner_property_detail_v1(uuid)
to authenticated, service_role;

commit;
