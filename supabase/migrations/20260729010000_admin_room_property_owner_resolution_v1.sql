begin;

/*
 * Admin room creation currently writes directly to rooms while the
 * protect_room_system_fields() trigger requires property_id.  This
 * migration keeps the admin UI free-form and resolves the property in the
 * same database transaction as the room insert.
 */

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.admin_normalize_property_text_v1(
  p_value text
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $function$
  select trim(
    regexp_replace(
      lower(unaccent(btrim(coalesce(p_value, '')))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$function$;

create or replace function public.admin_normalize_phone_v1(
  p_phone text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  with normalized as (
    select nullif(
      regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'),
      ''
    ) as digits
  )
  select case
    when digits is null then null
    when digits like '00%' then
      case
        when substr(digits, 3) like '84%'
          then '84' || ltrim(substr(digits, 5), '0')
        else substr(digits, 3)
      end
    when digits like '0%' then '84' || substr(digits, 2)
    when digits like '84%' then '84' || ltrim(substr(digits, 3), '0')
    else digits
  end
  from normalized;
$function$;

/*
 * Current matching rule:
 *   house number + street + district + city
 *
 * Ward is deliberately not part of the primary key.  If district is empty
 * (future address model), ward becomes the fallback geographic component.
 */
create or replace function public.admin_property_address_key_v1(
  p_house_number text,
  p_address text,
  p_ward text,
  p_district text,
  p_city text
)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $function$
  select concat_ws(
    '|',
    public.admin_normalize_property_text_v1(p_house_number),
    public.admin_normalize_property_text_v1(p_address),
    public.admin_normalize_property_text_v1(p_city),
    case
      when public.admin_normalize_property_text_v1(p_district) <> ''
        then public.admin_normalize_property_text_v1(p_district)
      else public.admin_normalize_property_text_v1(p_ward)
    end
  );
$function$;

create table if not exists public.property_owner_claims (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references public.properties(id)
    on delete cascade,
  phone text not null,
  status text not null default 'pending',
  matched_user_id uuid
    references auth.users(id)
    on delete set null,
  created_by uuid
    references auth.users(id)
    on delete set null,
  source text not null default 'admin_room',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,

  constraint property_owner_claims_status_check
    check (status in ('pending', 'claimed', 'cancelled')),
  constraint property_owner_claims_phone_check
    check (phone ~ '^[0-9]+$'),
  constraint property_owner_claims_property_phone_key
    unique (property_id, phone)
);

create index if not exists idx_property_owner_claims_phone_status
on public.property_owner_claims (phone, status);

create index if not exists idx_property_owner_claims_property_status
on public.property_owner_claims (property_id, status);

alter table public.property_owner_claims enable row level security;

revoke all on table public.property_owner_claims from public, anon, authenticated;
grant all on table public.property_owner_claims to service_role;

/*
 * Return candidate properties without creating anything.  The admin UI uses
 * this RPC to show a chooser when duplicate properties share an address.
 */
create or replace function public.admin_resolve_property_for_room_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level int := 0;
  v_house_number text;
  v_address text;
  v_ward text;
  v_district text;
  v_city text;
  v_candidates jsonb := '[]'::jsonb;
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select coalesce(level, 0)
    into v_level
  from public.admin_users
  where user_id = v_uid
  limit 1;

  if v_level not in (1, 2) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_house_number := nullif(btrim(p_payload->>'house_number'), '');
  v_address := nullif(btrim(p_payload->>'address'), '');
  v_ward := nullif(btrim(p_payload->>'ward'), '');
  v_district := nullif(btrim(p_payload->>'district'), '');
  v_city := coalesce(
    nullif(btrim(p_payload->>'city'), ''),
    'Hồ Chí Minh'
  );

  if v_house_number is null or v_address is null then
    return jsonb_build_object(
      'ok', true,
      'match_status', 'insufficient_address',
      'property_id', null,
      'candidates', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.name,
        'house_number', p.house_number,
        'address', p.address,
        'ward', p.ward,
        'district', p.district,
        'city', p.city,
        'approval_status', p.approval_status,
        'lifecycle_status', p.lifecycle_status,
        'owner_count', (
          select count(*)::int
          from public.property_members pm
          where pm.property_id = p.id
            and pm.role = 'owner'
            and pm.status = 'active'
        ),
        'room_count', (
          select count(*)::int
          from public.rooms r
          where r.property_id = p.id
            and r.lifecycle_status = 'active'
        )
      )
      order by p.created_at desc, p.id
    ),
    '[]'::jsonb
  )
  into v_candidates
  from public.properties p
  where p.lifecycle_status = 'active'
    and public.admin_normalize_property_text_v1(p.house_number)
      = public.admin_normalize_property_text_v1(v_house_number)
    and public.admin_normalize_property_text_v1(p.address)
      = public.admin_normalize_property_text_v1(v_address)
    and public.admin_normalize_property_text_v1(p.city)
      = public.admin_normalize_property_text_v1(v_city)
    and (
      (
        public.admin_normalize_property_text_v1(v_district) <> ''
        and public.admin_normalize_property_text_v1(p.district)
          = public.admin_normalize_property_text_v1(v_district)
      )
      or (
        public.admin_normalize_property_text_v1(v_district) = ''
        and public.admin_normalize_property_text_v1(v_ward) <> ''
        and public.admin_normalize_property_text_v1(p.ward)
          = public.admin_normalize_property_text_v1(v_ward)
      )
      or (
        public.admin_normalize_property_text_v1(v_district) <> ''
        and public.admin_normalize_property_text_v1(p.district) = ''
        and public.admin_normalize_property_text_v1(v_ward) <> ''
        and public.admin_normalize_property_text_v1(p.ward)
          = public.admin_normalize_property_text_v1(v_ward)
      )
    );

  v_count := jsonb_array_length(v_candidates);

  return jsonb_build_object(
    'ok', true,
    'match_status', case
      when v_count = 0 then 'not_found'
      when v_count = 1 then 'matched'
      else 'ambiguous'
    end,
    'property_id', case
      when v_count = 1 then (v_candidates->0->>'id')::uuid
      else null
    end,
    'candidates', v_candidates
  );
end;
$function$;

/*
 * Claim all properties waiting for the authenticated user's verified phone.
 * The owner layout calls this after authentication and before loading
 * getProperties()/getOwnerRooms().
 */
create or replace function public.claim_admin_properties_by_phone_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_user_phone text;
  v_claim record;
  v_claimed jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select public.admin_normalize_phone_v1(u.phone)
    into v_user_phone
  from auth.users u
  where u.id = v_uid;

  if v_user_phone is null then
    return jsonb_build_object(
      'ok', true,
      'claimed_count', 0,
      'properties', '[]'::jsonb
    );
  end if;

  for v_claim in
    select c.id, c.property_id
    from public.property_owner_claims c
    where c.phone = v_user_phone
      and c.status = 'pending'
    order by c.created_at
    for update
  loop
    insert into public.property_members (
      property_id,
      user_id,
      role,
      status,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_claim.property_id,
      v_uid,
      'owner',
      'active',
      v_uid,
      now(),
      now()
    )
    on conflict (property_id, user_id)
    do update set
      role = 'owner',
      status = 'active',
      updated_at = now();

    insert into public.property_owners (
      property_id,
      user_id,
      created_at
    )
    values (
      v_claim.property_id,
      v_uid,
      now()
    )
    on conflict (property_id, user_id)
    do nothing;

    update public.property_owner_claims
    set
      status = 'claimed',
      matched_user_id = v_uid,
      claimed_at = now(),
      updated_at = now()
    where id = v_claim.id;

    v_claimed := v_claimed || jsonb_build_array(v_claim.property_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'claimed_count', jsonb_array_length(v_claimed),
    'properties', v_claimed
  );
end;
$function$;

/*
 * Replace the admin upsert while preserving its existing signature and
 * return shape.  Existing rooms keep their property_id on update.  New
 * rooms can pass property_id after the duplicate chooser; otherwise the
 * resolver selects one matching property or creates an approved admin
 * property when there is no match.
 */
create or replace function public.admin_upsert_room_v1(
  p_room_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_level int := 0;
  v_id uuid := p_room_id;
  v_row public.rooms%rowtype;
  v_property_id uuid;
  v_existing_property_id uuid;
  v_resolution jsonb;
  v_candidates jsonb;
  v_candidate_count int;
  v_house_number text;
  v_address text;
  v_ward text;
  v_district text;
  v_city text;
  v_zalo_phone text;
  v_owner_phone text;
  v_owner_user_id uuid;
  v_new_property_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select coalesce(level, 0)
    into v_level
  from public.admin_users
  where user_id = v_uid
  limit 1;

  if v_level not in (1, 2) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
  end if;

  v_house_number := nullif(btrim(p_payload->>'house_number'), '');
  v_address := nullif(btrim(p_payload->>'address'), '');
  v_ward := nullif(btrim(p_payload->>'ward'), '');
  v_district := nullif(btrim(p_payload->>'district'), '');
  v_city := coalesce(
    nullif(btrim(p_payload->>'city'), ''),
    'Hồ Chí Minh'
  );
  v_zalo_phone := nullif(btrim(p_payload->>'zalo_phone'), '');
  v_owner_phone := public.admin_normalize_phone_v1(v_zalo_phone);

  select r.property_id
    into v_existing_property_id
  from public.rooms r
  where r.id = v_id;

  /*
   * Existing room: preserve the current property.  Historical rows with a
   * missing property are repaired by the same resolver used for new rooms.
   */
  v_property_id := v_existing_property_id;

  if v_property_id is null then
    v_property_id := nullif(p_payload->>'property_id', '')::uuid;
  end if;

  if v_property_id is null then
    v_resolution := public.admin_resolve_property_for_room_v1(p_payload);
    v_candidates := coalesce(v_resolution->'candidates', '[]'::jsonb);
    v_candidate_count := jsonb_array_length(v_candidates);

    if v_candidate_count > 1 then
      raise exception using
        errcode = 'P0001',
        message = 'PROPERTY_MATCH_REQUIRED',
        detail = v_candidates::text;
    end if;

    if v_candidate_count = 1 then
      v_property_id := (v_candidates->0->>'id')::uuid;
    end if;
  end if;

  if v_property_id is null then
    if v_house_number is null or v_address is null then
      raise exception using
        errcode = '22023',
        message = 'INVALID_ADDRESS',
        detail = 'house_number and address are required to create a property';
    end if;

    v_new_property_id := gen_random_uuid();

    insert into public.properties (
      id,
      code,
      name,
      property_key,
      house_number,
      address,
      district,
      ward,
      city,
      approval_status,
      lifecycle_status,
      created_by,
      submitted_at,
      normalized_property_key,
      created_at,
      updated_at
    )
    values (
      v_new_property_id,
      'KL-' || upper(substr(replace(v_new_property_id::text, '-', ''), 1, 8)),
      concat('Tòa nhà ', v_house_number, ' ', v_address),
      'admin-' || replace(v_new_property_id::text, '-', ''),
      v_house_number,
      v_address,
      coalesce(v_district, ''),
      v_ward,
      v_city,
      'approved',
      'active',
      v_uid,
      now(),
      public.admin_property_address_key_v1(
        v_house_number,
        v_address,
        v_ward,
        v_district,
        v_city
      ),
      now(),
      now()
    )
    returning id into v_property_id;

    /*
     * Existing phone account gets ownership immediately. If no account
     * exists yet, keep a pending claim for the future login.
     */
    if v_owner_phone is not null then
      select u.id
        into v_owner_user_id
      from auth.users u
      where public.admin_normalize_phone_v1(u.phone) = v_owner_phone
      order by u.created_at
      limit 1;

      if v_owner_user_id is not null then
        insert into public.property_members (
          property_id,
          user_id,
          role,
          status,
          created_by,
          created_at,
          updated_at
        )
        values (
          v_property_id,
          v_owner_user_id,
          'owner',
          'active',
          v_uid,
          now(),
          now()
        )
        on conflict (property_id, user_id)
        do update set
          role = 'owner',
          status = 'active',
          updated_at = now();

        insert into public.property_owners (
          property_id,
          user_id,
          created_at
        )
        values (
          v_property_id,
          v_owner_user_id,
          now()
        )
        on conflict (property_id, user_id)
        do nothing;
      else
        insert into public.property_owner_claims (
          property_id,
          phone,
          created_by,
          source,
          created_at,
          updated_at
        )
        values (
          v_property_id,
          v_owner_phone,
          v_uid,
          'admin_room',
          now(),
          now()
        )
        on conflict (property_id, phone)
        do update set
          updated_at = now();
      end if;
    end if;
  else
    /*
     * Admin-selected property must exist and be active.  The duplicate
     * chooser supplies this id; it cannot point at an arbitrary property.
     */
    if not exists (
      select 1
      from public.properties p
      where p.id = v_property_id
        and p.lifecycle_status = 'active'
    ) then
      raise exception 'property_not_found_or_inactive' using errcode = 'P0002';
    end if;

    if p_payload ? 'property_id'
      and v_existing_property_id is null
      and not exists (
        select 1
        from jsonb_array_elements(
          coalesce(
            public.admin_resolve_property_for_room_v1(p_payload)->'candidates',
            '[]'::jsonb
          )
        ) candidate
        where candidate->>'id' = v_property_id::text
      )
    then
      raise exception 'PROPERTY_MATCH_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  if exists (select 1 from public.rooms r where r.id = v_id) then
    update public.rooms r
    set
      room_code    = nullif(p_payload->>'room_code', ''),
      room_type    = nullif(p_payload->>'room_type', ''),
      house_number = nullif(p_payload->>'house_number', ''),
      address      = nullif(p_payload->>'address', ''),
      ward         = nullif(p_payload->>'ward', ''),
      district     = nullif(p_payload->>'district', ''),
      price        = case
        when p_payload ? 'price'
          then (p_payload->>'price')::bigint
        else r.price
      end,
      status       = nullif(p_payload->>'status', ''),
      description  = nullif(p_payload->>'description', ''),
      link_zalo    = nullif(p_payload->>'link_zalo', ''),
      zalo_phone   = nullif(p_payload->>'zalo_phone', ''),
      chinh_sach   = nullif(p_payload->>'chinh_sach', ''),
      property_id  = coalesce(r.property_id, v_property_id),
      updated_at   = now()
    where r.id = v_id
    returning * into v_row;
  else
    insert into public.rooms (
      id,
      room_code,
      room_type,
      house_number,
      address,
      ward,
      district,
      price,
      status,
      description,
      link_zalo,
      zalo_phone,
      chinh_sach,
      owner_id,
      property_id,
      created_at,
      updated_at
    )
    values (
      v_id,
      nullif(p_payload->>'room_code', ''),
      nullif(p_payload->>'room_type', ''),
      nullif(p_payload->>'house_number', ''),
      nullif(p_payload->>'address', ''),
      nullif(p_payload->>'ward', ''),
      nullif(p_payload->>'district', ''),
      case
        when p_payload ? 'price'
          then (p_payload->>'price')::bigint
        else null
      end,
      nullif(p_payload->>'status', ''),
      nullif(p_payload->>'description', ''),
      nullif(p_payload->>'link_zalo', ''),
      nullif(p_payload->>'zalo_phone', ''),
      nullif(p_payload->>'chinh_sach', ''),
      coalesce(nullif(p_payload->>'owner_id', '')::uuid, v_uid),
      v_property_id,
      now(),
      now()
    )
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$function$;

revoke all
on function public.admin_normalize_property_text_v1(text)
from public, anon;

revoke all
on function public.admin_normalize_phone_v1(text)
from public, anon;

revoke all
on function public.admin_property_address_key_v1(text, text, text, text, text)
from public, anon;

revoke all
on function public.admin_resolve_property_for_room_v1(jsonb)
from public, anon;

revoke all
on function public.claim_admin_properties_by_phone_v1()
from public, anon;

revoke all
on function public.admin_upsert_room_v1(uuid, jsonb)
from public, anon;

grant execute on function public.admin_resolve_property_for_room_v1(jsonb)
to authenticated, service_role;

grant execute on function public.claim_admin_properties_by_phone_v1()
to authenticated, service_role;

grant execute on function public.admin_upsert_room_v1(uuid, jsonb)
to authenticated, service_role;

commit;
