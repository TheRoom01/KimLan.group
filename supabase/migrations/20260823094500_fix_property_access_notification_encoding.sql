begin;

create or replace function public.request_my_phone_property_access_v1(
  p_property_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_has_owner boolean;
  v_matches boolean;
  v_request_id uuid;
  v_address text;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_property_id is null or v_role not in ('owner', 'manager') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  perform 1
  from public.properties property
  where property.id = p_property_id
    and coalesce(property.lifecycle_status, 'active') <> 'archived'
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.properties property
    where property.id = p_property_id
      and exists (
        select 1
        from public.member_contact_phones contact
        where contact.user_id = v_uid
          and contact.is_verified = true
          and public.owner_phone_key_v1(contact.phone) is not null
          and (
            regexp_replace(coalesce(property.default_room_data->>'zalo_phone', ''), '[^0-9]', '', 'g')
              like '%' || public.owner_phone_key_v1(contact.phone) || '%'
            or exists (
              select 1
              from public.rooms room
              where room.property_id = property.id
                and coalesce(room.lifecycle_status, 'active') = 'active'
                and regexp_replace(coalesce(room.zalo_phone, ''), '[^0-9]', '', 'g')
                  like '%' || public.owner_phone_key_v1(contact.phone) || '%'
            )
          )
      )
  ) into v_matches;

  if not v_matches then
    raise exception 'PHONE_MISMATCH' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.property_members member
    where member.property_id = p_property_id
      and member.user_id = v_uid
      and member.status = 'active'
  ) then
    return jsonb_build_object('mode', 'already_member', 'property_id', p_property_id);
  end if;

  select exists (
    select 1 from public.property_members owner_member
    where owner_member.property_id = p_property_id
      and owner_member.role = 'owner'
      and owner_member.status = 'active'
  ) into v_has_owner;

  if not v_has_owner then
    insert into public.property_members (
      property_id, user_id, role, status, created_by, created_at, updated_at
    ) values (
      p_property_id, v_uid, v_role, 'active', v_uid, now(), now()
    )
    on conflict (property_id, user_id) do update
      set role = excluded.role, status = 'active', updated_at = now();

    if v_role = 'owner' then
      insert into public.property_owners (property_id, user_id, created_at)
      values (p_property_id, v_uid, now())
      on conflict (property_id, user_id) do nothing;
    end if;

    delete from public.property_suggestion_dismissals
    where user_id = v_uid and property_id = p_property_id;

    select concat_ws(', ', property.house_number, property.address, property.ward, property.district, property.city)
    into v_address
    from public.properties property
    where property.id = p_property_id;

    insert into public.notifications (
      user_id, type, title, message, reference_id, reference_type, is_read
    ) values (
      v_uid,
      'property_access_granted',
      case when v_role = 'owner' then 'Đã nhận quyền chủ nhà' else 'Đã nhận quyền quản lý' end,
      coalesce(v_address, 'Tòa nhà'),
      p_property_id,
      'property',
      false
    );

    return jsonb_build_object(
      'mode', 'access_granted',
      'property_id', p_property_id,
      'role', v_role
    );
  end if;

  select request.id into v_request_id
  from public.property_join_requests request
  where request.property_id = p_property_id
    and request.requester_user_id = v_uid
    and request.status = 'pending'
  order by request.created_at desc
  limit 1;

  if v_request_id is null then
    insert into public.property_join_requests (
      property_id, requester_user_id, requested_role, status, message
    ) values (
      p_property_id,
      v_uid,
      v_role,
      'pending',
      case
        when v_role = 'owner' then 'Số điện thoại đã xác minh trùng với thông tin Zalo của tòa nhà/phòng. Yêu cầu quyền chủ nhà.'
        else 'Số điện thoại đã xác minh trùng với thông tin Zalo của tòa nhà/phòng. Yêu cầu quyền quản lý.'
      end
    ) returning id into v_request_id;
  else
    update public.property_join_requests
    set requested_role = v_role,
        message = case
          when v_role = 'owner' then 'Cập nhật yêu cầu thành quyền chủ nhà.'
          else 'Cập nhật yêu cầu thành quyền quản lý.'
        end
    where id = v_request_id;
  end if;

  insert into public.property_suggestion_dismissals (user_id, property_id, dismissed_at)
  values (v_uid, p_property_id, now())
  on conflict (user_id, property_id) do update set dismissed_at = now();

  return jsonb_build_object(
    'mode', 'request_pending',
    'property_id', p_property_id,
    'request_id', v_request_id,
    'role', v_role
  );
end;
$function$;

revoke all on function public.request_my_phone_property_access_v1(uuid, text)
from public, anon;
grant execute on function public.request_my_phone_property_access_v1(uuid, text)
to authenticated, service_role;

update public.notifications notification
set title = case
  when exists (
    select 1
    from public.property_members member
    where member.property_id = notification.reference_id
      and member.user_id = notification.user_id
      and member.role = 'owner'
  ) then 'Đã nhận quyền chủ nhà'
  else 'Đã nhận quyền quản lý'
end
where notification.type = 'property_access_granted'
  and notification.reference_type = 'property';

commit;
