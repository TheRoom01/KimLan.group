begin;

create or replace function public.save_room_details_v1(
  p_room_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_no_pet boolean;
  v_allow_pet boolean;
  v_allow_cat boolean;
  v_allow_dog boolean;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'UNAUTHENTICATED';
  end if;

  if p_room_id is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'room_id is required';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'INVALID_INPUT',
      detail = 'payload must be a JSON object';
  end if;

  if not exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'NOT_FOUND',
      detail = 'Room not found';
  end if;

  if not public.can_manage_room(p_room_id) then
    raise exception using
      errcode = '42501',
      message = 'FORBIDDEN';
  end if;

  select
    case
      when p_payload ? 'no_pet'
        then coalesce((p_payload->>'no_pet')::boolean, false)
      else coalesce(rd.no_pet, false)
    end,
    case
      when p_payload ? 'allow_pet'
        then coalesce((p_payload->>'allow_pet')::boolean, false)
      else coalesce(rd.allow_pet, false)
    end,
    case
      when p_payload ? 'allow_cat'
        then coalesce((p_payload->>'allow_cat')::boolean, false)
      else coalesce(rd.allow_cat, false)
    end,
    case
      when p_payload ? 'allow_dog'
        then coalesce((p_payload->>'allow_dog')::boolean, false)
      else coalesce(rd.allow_dog, false)
    end
  into
    v_no_pet,
    v_allow_pet,
    v_allow_cat,
    v_allow_dog
  from (
    select 1
  ) seed
  left join public.room_details rd
    on rd.room_id = p_room_id;

  if v_no_pet then
    v_allow_pet := false;
    v_allow_cat := false;
    v_allow_dog := false;
  end if;

  insert into public.room_details (
    id,
    room_id,
    electric_fee_value,
    electric_fee_unit,
    water_fee_value,
    water_fee_unit,
    service_fee_value,
    service_fee_unit,
    parking_fee_value,
    parking_fee_unit,
    other_fee_value,
    other_fee_note,
    has_elevator,
    has_stairs,
    shared_washer,
    private_washer,
    shared_dryer,
    private_dryer,
    has_parking,
    has_basement,
    fingerprint_lock,
    allow_pet,
    allow_cat,
    allow_dog,
    no_pet,
    short_term,
    long_term,
    other_amenities,
    detail_json,
    created_at
  )
  values (
    gen_random_uuid(),
    p_room_id,
    nullif(p_payload->>'electric_fee_value', '')::numeric,
    nullif(p_payload->>'electric_fee_unit', ''),
    nullif(p_payload->>'water_fee_value', '')::numeric,
    nullif(p_payload->>'water_fee_unit', ''),
    nullif(p_payload->>'service_fee_value', '')::numeric,
    nullif(p_payload->>'service_fee_unit', ''),
    nullif(p_payload->>'parking_fee_value', '')::numeric,
    nullif(p_payload->>'parking_fee_unit', ''),
    nullif(p_payload->>'other_fee_value', '')::numeric,
    nullif(p_payload->>'other_fee_note', ''),
    coalesce((p_payload->>'has_elevator')::boolean, false),
    coalesce((p_payload->>'has_stairs')::boolean, false),
    coalesce((p_payload->>'shared_washer')::boolean, false),
    coalesce((p_payload->>'private_washer')::boolean, false),
    coalesce((p_payload->>'shared_dryer')::boolean, false),
    coalesce((p_payload->>'private_dryer')::boolean, false),
    coalesce((p_payload->>'has_parking')::boolean, false),
    coalesce((p_payload->>'has_basement')::boolean, false),
    coalesce((p_payload->>'fingerprint_lock')::boolean, false),
    v_allow_pet,
    v_allow_cat,
    v_allow_dog,
    v_no_pet,
    coalesce((p_payload->>'short_term')::boolean, false),
    coalesce((p_payload->>'long_term')::boolean, true),
    nullif(p_payload->>'other_amenities', ''),
    coalesce(p_payload->'detail_json', '{}'::jsonb),
    now()
  )
  on conflict (room_id)
  do update set
    electric_fee_value = case
      when p_payload ? 'electric_fee_value'
        then nullif(p_payload->>'electric_fee_value', '')::numeric
      else room_details.electric_fee_value
    end,
    electric_fee_unit = case
      when p_payload ? 'electric_fee_unit'
        then nullif(p_payload->>'electric_fee_unit', '')
      else room_details.electric_fee_unit
    end,
    water_fee_value = case
      when p_payload ? 'water_fee_value'
        then nullif(p_payload->>'water_fee_value', '')::numeric
      else room_details.water_fee_value
    end,
    water_fee_unit = case
      when p_payload ? 'water_fee_unit'
        then nullif(p_payload->>'water_fee_unit', '')
      else room_details.water_fee_unit
    end,
    service_fee_value = case
      when p_payload ? 'service_fee_value'
        then nullif(p_payload->>'service_fee_value', '')::numeric
      else room_details.service_fee_value
    end,
    service_fee_unit = case
      when p_payload ? 'service_fee_unit'
        then nullif(p_payload->>'service_fee_unit', '')
      else room_details.service_fee_unit
    end,
    parking_fee_value = case
      when p_payload ? 'parking_fee_value'
        then nullif(p_payload->>'parking_fee_value', '')::numeric
      else room_details.parking_fee_value
    end,
    parking_fee_unit = case
      when p_payload ? 'parking_fee_unit'
        then nullif(p_payload->>'parking_fee_unit', '')
      else room_details.parking_fee_unit
    end,
    other_fee_value = case
      when p_payload ? 'other_fee_value'
        then nullif(p_payload->>'other_fee_value', '')::numeric
      else room_details.other_fee_value
    end,
    other_fee_note = case
      when p_payload ? 'other_fee_note'
        then nullif(p_payload->>'other_fee_note', '')
      else room_details.other_fee_note
    end,
    has_elevator = case
      when p_payload ? 'has_elevator'
        then coalesce((p_payload->>'has_elevator')::boolean, false)
      else room_details.has_elevator
    end,
    has_stairs = case
      when p_payload ? 'has_stairs'
        then coalesce((p_payload->>'has_stairs')::boolean, false)
      else room_details.has_stairs
    end,
    shared_washer = case
      when p_payload ? 'shared_washer'
        then coalesce((p_payload->>'shared_washer')::boolean, false)
      else room_details.shared_washer
    end,
    private_washer = case
      when p_payload ? 'private_washer'
        then coalesce((p_payload->>'private_washer')::boolean, false)
      else room_details.private_washer
    end,
    shared_dryer = case
      when p_payload ? 'shared_dryer'
        then coalesce((p_payload->>'shared_dryer')::boolean, false)
      else room_details.shared_dryer
    end,
    private_dryer = case
      when p_payload ? 'private_dryer'
        then coalesce((p_payload->>'private_dryer')::boolean, false)
      else room_details.private_dryer
    end,
    has_parking = case
      when p_payload ? 'has_parking'
        then coalesce((p_payload->>'has_parking')::boolean, false)
      else room_details.has_parking
    end,
    has_basement = case
      when p_payload ? 'has_basement'
        then coalesce((p_payload->>'has_basement')::boolean, false)
      else room_details.has_basement
    end,
    fingerprint_lock = case
      when p_payload ? 'fingerprint_lock'
        then coalesce((p_payload->>'fingerprint_lock')::boolean, false)
      else room_details.fingerprint_lock
    end,
    allow_pet = v_allow_pet,
    allow_cat = v_allow_cat,
    allow_dog = v_allow_dog,
    no_pet = v_no_pet,
    short_term = case
      when p_payload ? 'short_term'
        then coalesce((p_payload->>'short_term')::boolean, false)
      else room_details.short_term
    end,
    long_term = case
      when p_payload ? 'long_term'
        then coalesce((p_payload->>'long_term')::boolean, true)
      else room_details.long_term
    end,
    other_amenities = case
      when p_payload ? 'other_amenities'
        then nullif(p_payload->>'other_amenities', '')
      else room_details.other_amenities
    end,
    detail_json = case
      when p_payload ? 'detail_json'
        then coalesce(p_payload->'detail_json', '{}'::jsonb)
      else room_details.detail_json
    end;
end;
$function$;

revoke all on function public.save_room_details_v1(uuid, jsonb)
from public, anon;

grant execute on function public.save_room_details_v1(uuid, jsonb)
to authenticated;

commit;
