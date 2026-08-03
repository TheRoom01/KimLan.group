begin;

create or replace function public.get_my_phone_property_suggestions_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.updated_at desc), '[]'::jsonb)
  into v_result
  from (
    select distinct
      p.id,
      p.code,
      p.house_number,
      p.address,
      p.ward,
      p.district,
      p.city,
      p.updated_at,
      exists (
        select 1
        from public.property_members owner_member
        where owner_member.property_id = p.id
          and owner_member.role = 'owner'
          and owner_member.status = 'active'
      ) as has_owner,
      (
        select request.requested_role
        from public.property_join_requests request
        where request.property_id = p.id
          and request.requester_user_id = v_uid
          and request.status = 'pending'
        order by request.created_at desc
        limit 1
      ) as pending_role,
      case
        when exists (
          select 1
          from public.member_contact_phones contact
          where contact.user_id = v_uid
            and contact.is_verified = true
            and public.owner_phone_key_v1(contact.phone) is not null
            and regexp_replace(coalesce(p.default_room_data->>'zalo_phone', ''), '[^0-9]', '', 'g')
              like '%' || public.owner_phone_key_v1(contact.phone) || '%'
        ) then 'property'
        else 'room'
      end as match_source
    from public.properties p
    where coalesce(p.lifecycle_status, 'active') <> 'archived'
      and not exists (
        select 1
        from public.property_suggestion_dismissals dismissal
        where dismissal.user_id = v_uid
          and dismissal.property_id = p.id
      )
      and not exists (
        select 1
        from public.property_members member
        where member.property_id = p.id
          and member.user_id = v_uid
          and member.status = 'active'
      )
      and exists (
        select 1
        from public.member_contact_phones contact
        where contact.user_id = v_uid
          and contact.is_verified = true
          and public.owner_phone_key_v1(contact.phone) is not null
          and (
            regexp_replace(coalesce(p.default_room_data->>'zalo_phone', ''), '[^0-9]', '', 'g')
              like '%' || public.owner_phone_key_v1(contact.phone) || '%'
            or exists (
              select 1
              from public.rooms room
              where room.property_id = p.id
                and coalesce(room.lifecycle_status, 'active') = 'active'
                and regexp_replace(coalesce(room.zalo_phone, ''), '[^0-9]', '', 'g')
                  like '%' || public.owner_phone_key_v1(contact.phone) || '%'
            )
          )
      )
  ) candidate;

  return jsonb_build_object('suggestions', v_result);
end;
$function$;

revoke all on function public.get_my_phone_property_suggestions_v1() from public, anon;
grant execute on function public.get_my_phone_property_suggestions_v1() to authenticated, service_role;

commit;
