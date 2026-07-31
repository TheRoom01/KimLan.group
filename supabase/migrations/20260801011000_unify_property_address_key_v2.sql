begin;

update public.properties p
set normalized_property_key = public.property_address_key_v2(
      p.house_number,
      p.address,
      p.district
    ),
    updated_at = now()
where p.normalized_property_key is distinct from public.property_address_key_v2(
  p.house_number,
  p.address,
  p.district
);

create or replace function public.create_property_v2(
  p_house_number text,
  p_address text,
  p_ward text,
  p_district text,
  p_city text default 'Hồ Chí Minh',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_property_id uuid;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  if nullif(btrim(p_house_number), '') is null
    or nullif(btrim(p_address), '') is null
    or nullif(btrim(p_district), '') is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_ADDRESS',
      detail = 'house_number, address and district are required';
  end if;

  v_key := public.property_address_key_v2(
    p_house_number,
    p_address,
    p_district
  );

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select p.id into v_existing
  from public.properties p
  where p.normalized_property_key = v_key
    and coalesce(p.lifecycle_status, 'active') <> 'archived'
  order by
    case when exists (
      select 1
      from public.property_members pm
      where pm.property_id = p.id
        and pm.role = 'owner'
        and pm.status = 'active'
    ) then 1 else 0 end,
    p.created_at
  limit 1;

  if v_existing is not null then
    if exists (
      select 1
      from public.property_members pm
      where pm.property_id = v_existing
        and pm.user_id = v_user
        and pm.status = 'active'
    ) then
      return jsonb_build_object(
        'mode', 'already_member',
        'property_id', v_existing
      );
    end if;

    if not exists (
      select 1
      from public.property_join_requests pjr
      where pjr.property_id = v_existing
        and pjr.requester_user_id = v_user
        and pjr.status = 'pending'
    ) then
      insert into public.property_join_requests (
        property_id,
        requester_user_id,
        requested_role,
        status,
        message
      ) values (
        v_existing,
        v_user,
        'owner',
        'pending',
        'Yêu cầu nhận quyền sở hữu tòa nhà đã có phòng từ Admin'
      );
    end if;

    return jsonb_build_object(
      'mode', 'join_request_created',
      'property_id', v_existing
    );
  end if;

  v_property_id := gen_random_uuid();

  insert into public.properties (
    id,
    code,
    name,
    property_key,
    normalized_property_key,
    house_number,
    address,
    ward,
    district,
    city,
    note,
    approval_status,
    lifecycle_status,
    created_by
  ) values (
    v_property_id,
    'KL-' || upper(substr(replace(v_property_id::text, '-', ''), 1, 8)),
    concat('Tòa nhà ', btrim(p_house_number), ' ', btrim(p_address)),
    'owner-' || replace(v_property_id::text, '-', ''),
    v_key,
    btrim(p_house_number),
    btrim(p_address),
    nullif(btrim(p_ward), ''),
    btrim(p_district),
    coalesce(nullif(btrim(p_city), ''), 'Hồ Chí Minh'),
    nullif(btrim(p_note), ''),
    'approved',
    'active',
    v_user
  );

  insert into public.property_owners (property_id, user_id)
  values (v_property_id, v_user);

  insert into public.property_members (
    property_id,
    user_id,
    role,
    status,
    created_by
  ) values (
    v_property_id,
    v_user,
    'owner',
    'active',
    v_user
  );

  return jsonb_build_object(
    'mode', 'created',
    'property_id', v_property_id
  );
end;
$function$;

revoke all on function public.create_property_v2(text, text, text, text, text, text)
from public, anon;
grant execute on function public.create_property_v2(text, text, text, text, text, text)
to authenticated, service_role;

commit;
