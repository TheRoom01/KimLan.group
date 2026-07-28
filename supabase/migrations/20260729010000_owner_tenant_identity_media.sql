begin;

alter table public.tenants
  add column if not exists cccd_front_url text,
  add column if not exists cccd_front_path text,
  add column if not exists cccd_back_url text,
  add column if not exists cccd_back_path text;

comment on column public.tenants.cccd_front_url is
  'Owner-only CCCD front image URL stored in the configured R2 bucket.';

comment on column public.tenants.cccd_back_url is
  'Owner-only CCCD back image URL stored in the configured R2 bucket.';

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
      (
        select max(rc.created_at)
        from public.contract_tenants ct
        join public.rental_contracts rc on rc.id = ct.contract_id
        join public.rooms r on r.id = rc.room_id
        where ct.tenant_id = t.id
          and public.can_view_property(r.property_id)
      ) as last_contract_created_at,
      jsonb_build_object(
        'tenant',
        jsonb_build_object(
          'id', t.id,
          'full_name', t.full_name,
          'phone', t.phone,
          'cccd', t.cccd,
          'cccd_front_url', case
            when t.cccd_front_path is not null
              then '/api/owner/tenants/' || t.id || '/identity-image?side=front'
            else null
          end,
          'cccd_back_url', case
            when t.cccd_back_path is not null
              then '/api/owner/tenants/' || t.id || '/identity-image?side=back'
            else null
          end
        ),
        'contracts_count',
        (
          select count(distinct rc.id)
          from public.contract_tenants ct
          join public.rental_contracts rc on rc.id = ct.contract_id
          join public.rooms r on r.id = rc.room_id
          where ct.tenant_id = t.id
            and public.can_view_property(r.property_id)
        ),
        'active_contract',
        (
          select jsonb_build_object(
            'id', rc.id,
            'status', rc.status,
            'start_date', rc.start_date,
            'end_date', rc.end_date,
            'monthly_price', rc.monthly_price,
            'deposit_amount', rc.deposit_amount,
            'tenant_role', ct.role,
            'room', jsonb_build_object(
              'id', r.id,
              'room_code', r.room_code,
              'room_type', r.room_type,
              'cover_image', (
                select rm.url
                from public.room_media rm
                where rm.room_id = r.id
                  and rm.type = 'image'
                order by
                  case when rm.is_cover then 0 else 1 end,
                  rm.sort_order nulls last,
                  rm.created_at nulls last
                limit 1
              )
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
            )
          )
          from public.contract_tenants ct
          join public.rental_contracts rc on rc.id = ct.contract_id
          join public.rooms r on r.id = rc.room_id
          join public.properties p on p.id = r.property_id
          where ct.tenant_id = t.id
            and public.can_view_property(p.id)
            and rc.status in (
              'active',
              'pending',
              'Đang hiệu lực',
              'Chờ nhận phòng'
            )
          order by
            case when rc.status in ('active', 'Đang hiệu lực') then 0 else 1 end,
            rc.start_date desc nulls last,
            rc.created_at desc nulls last
          limit 1
        )
      ) as data
    from public.tenants t
    where exists (
      select 1
      from public.contract_tenants ct
      join public.rental_contracts rc on rc.id = ct.contract_id
      join public.rooms r on r.id = rc.room_id
      where ct.tenant_id = t.id
        and public.can_view_property(r.property_id)
    )
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

create or replace function public.get_owner_tenant_detail_v1(
  p_tenant_id uuid
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

  if not exists (
    select 1
    from public.contract_tenants ct
    join public.rental_contracts rc on rc.id = ct.contract_id
    join public.rooms r on r.id = rc.room_id
    where ct.tenant_id = p_tenant_id
      and public.can_view_property(r.property_id)
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'tenant', (
      select jsonb_build_object(
        'id', t.id,
        'full_name', t.full_name,
        'phone', t.phone,
        'cccd', t.cccd,
        'date_of_birth', t.date_of_birth,
        'address', t.address,
        'cccd_front_url', case
          when t.cccd_front_path is not null
            then '/api/owner/tenants/' || t.id || '/identity-image?side=front'
          else null
        end,
        'cccd_back_url', case
          when t.cccd_back_path is not null
            then '/api/owner/tenants/' || t.id || '/identity-image?side=back'
          else null
        end
      )
      from public.tenants t
      where t.id = p_tenant_id
    ),
    'active_contract', (
      select jsonb_build_object(
        'id', rc.id,
        'status', rc.status,
        'start_date', rc.start_date,
        'end_date', rc.end_date,
        'monthly_price', rc.monthly_price,
        'deposit_amount', rc.deposit_amount,
        'tenant_role', ct.role,
        'room', jsonb_build_object(
          'id', r.id,
          'room_code', r.room_code,
          'room_type', r.room_type
        ),
        'property', jsonb_build_object(
          'id', p.id,
          'name', coalesce(nullif(btrim(p.name), ''), p.code),
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
        )
      )
      from public.contract_tenants ct
      join public.rental_contracts rc on rc.id = ct.contract_id
      join public.rooms r on r.id = rc.room_id
      join public.properties p on p.id = r.property_id
      where ct.tenant_id = p_tenant_id
        and public.can_view_property(p.id)
        and rc.status in (
          'active',
          'pending',
          'Đang hiệu lực',
          'Chờ nhận phòng'
        )
      order by
        case when rc.status in ('active', 'Đang hiệu lực') then 0 else 1 end,
        rc.start_date desc nulls last,
        rc.created_at desc nulls last
      limit 1
    ),
    'contracts', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rc.id,
            'status', rc.status,
            'start_date', rc.start_date,
            'end_date', rc.end_date,
            'monthly_price', rc.monthly_price,
            'deposit_amount', rc.deposit_amount,
            'tenant_role', ct.role,
            'room', jsonb_build_object(
              'id', r.id,
              'room_code', r.room_code
            ),
            'property', jsonb_build_object(
              'id', p.id,
              'name', coalesce(nullif(btrim(p.name), ''), p.code)
            )
          )
          order by rc.created_at desc nulls last
        ),
        '[]'::jsonb
      )
      from public.contract_tenants ct
      join public.rental_contracts rc on rc.id = ct.contract_id
      join public.rooms r on r.id = rc.room_id
      join public.properties p on p.id = r.property_id
      where ct.tenant_id = p_tenant_id
        and public.can_view_property(p.id)
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all
on function public.get_owner_tenant_detail_v1(uuid)
from public, anon;

grant execute
on function public.get_owner_tenant_detail_v1(uuid)
to authenticated, service_role;

create or replace function public.add_owner_room_occupant_v1(
  p_room_id uuid,
  p_full_name text,
  p_phone text default null,
  p_cccd text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_contract_id uuid;
  v_tenant_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if not public.can_manage_room(p_room_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'full_name is required';
  end if;

  select rc.id
  into v_contract_id
  from public.rental_contracts rc
  where rc.room_id = p_room_id
    and rc.status in (
      'active',
      'pending',
      'Đang hiệu lực',
      'Chờ nhận phòng'
    )
  order by
    case when rc.status in ('active', 'Đang hiệu lực') then 0 else 1 end,
    rc.start_date desc nulls last,
    rc.created_at desc nulls last
  limit 1;

  if v_contract_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Active contract not found';
  end if;

  insert into public.tenants (
    id,
    full_name,
    phone,
    cccd
  )
  values (
    v_tenant_id,
    btrim(p_full_name),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_cccd), '')
  );

  insert into public.contract_tenants (
    contract_id,
    tenant_id,
    role
  )
  values (
    v_contract_id,
    v_tenant_id,
    'Người ở cùng'
  );

  return jsonb_build_object(
    'tenant',
    jsonb_build_object(
      'id', v_tenant_id,
      'full_name', btrim(p_full_name),
      'phone', nullif(btrim(p_phone), ''),
      'cccd', nullif(btrim(p_cccd), ''),
      'role', 'Người ở cùng'
    )
  );
end;
$function$;

revoke all
on function public.add_owner_room_occupant_v1(uuid, text, text, text)
from public, anon;

grant execute
on function public.add_owner_room_occupant_v1(uuid, text, text, text)
to authenticated, service_role;

create or replace function public.owner_tenant_belongs_to_room_v1(
  p_room_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    auth.uid() is not null
    and public.can_manage_room(p_room_id)
    and exists (
      select 1
      from public.contract_tenants ct
      join public.rental_contracts rc on rc.id = ct.contract_id
      where ct.tenant_id = p_tenant_id
        and rc.room_id = p_room_id
    );
$function$;

revoke all
on function public.owner_tenant_belongs_to_room_v1(uuid, uuid)
from public, anon;

grant execute
on function public.owner_tenant_belongs_to_room_v1(uuid, uuid)
to authenticated, service_role;

create or replace function public.update_owner_tenant_identity_v1(
  p_room_id uuid,
  p_tenant_id uuid,
  p_cccd_front_url text default null,
  p_cccd_front_path text default null,
  p_cccd_back_url text default null,
  p_cccd_back_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_tenant public.tenants%rowtype;
begin
  if not public.owner_tenant_belongs_to_room_v1(p_room_id, p_tenant_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  update public.tenants
  set
    cccd_front_url = p_cccd_front_url,
    cccd_front_path = p_cccd_front_path,
    cccd_back_url = p_cccd_back_url,
    cccd_back_path = p_cccd_back_path
  where id = p_tenant_id
  returning *
  into v_tenant;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_tenant.id,
    'full_name', v_tenant.full_name,
    'phone', v_tenant.phone,
    'cccd', v_tenant.cccd,
    'cccd_front_url', case
      when v_tenant.cccd_front_path is not null
        then '/api/owner/tenants/' || v_tenant.id || '/identity-image?side=front'
      else null
    end,
    'cccd_back_url', case
      when v_tenant.cccd_back_path is not null
        then '/api/owner/tenants/' || v_tenant.id || '/identity-image?side=back'
      else null
    end
  );
end;
$function$;

revoke all
on function public.update_owner_tenant_identity_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
from public, anon;

grant execute
on function public.update_owner_tenant_identity_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
to authenticated, service_role;

create or replace function public.get_owner_tenant_identity_path_v1(
  p_tenant_id uuid,
  p_side text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_path text;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_side not in ('front', 'back') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'side must be front or back';
  end if;

  if not exists (
    select 1
    from public.contract_tenants ct
    join public.rental_contracts rc on rc.id = ct.contract_id
    join public.rooms r on r.id = rc.room_id
    where ct.tenant_id = p_tenant_id
      and public.can_view_property(r.property_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select case
    when p_side = 'front' then t.cccd_front_path
    else t.cccd_back_path
  end
  into v_path
  from public.tenants t
  where t.id = p_tenant_id;

  return v_path;
end;
$function$;

revoke all
on function public.get_owner_tenant_identity_path_v1(uuid, text)
from public, anon;

grant execute
on function public.get_owner_tenant_identity_path_v1(uuid, text)
to authenticated, service_role;

commit;
