begin;

create or replace function public.sync_property_shared_room_fields_v1(
  p_property_id uuid,
  p_link_zalo text,
  p_google_maps_url text,
  p_chinh_sach text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_room_count integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.can_manage_property(p_property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(coalesce(p_link_zalo, '')) > 2000
    or length(coalesce(p_google_maps_url, '')) > 2000
    or length(coalesce(p_chinh_sach, '')) > 10000 then
    raise exception 'INVALID_SHARED_FIELD_LENGTH' using errcode = '22023';
  end if;

  update public.properties
  set
    google_maps_url = nullif(btrim(p_google_maps_url), ''),
    default_room_data = coalesce(default_room_data, '{}'::jsonb)
      || jsonb_build_object(
        'link_zalo', nullif(btrim(p_link_zalo), ''),
        'chinh_sach', nullif(btrim(p_chinh_sach), '')
      ),
    updated_at = now()
  where id = p_property_id;

  if not found then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  update public.rooms
  set
    link_zalo = nullif(btrim(p_link_zalo), ''),
    google_maps_url = nullif(btrim(p_google_maps_url), ''),
    chinh_sach = nullif(btrim(p_chinh_sach), ''),
    updated_at = now()
  where property_id = p_property_id;
  get diagnostics v_room_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'property_id', p_property_id,
    'rooms_updated', v_room_count
  );
end;
$function$;

create or replace function public.sync_room_shared_property_fields_v1(
  p_room_id uuid,
  p_link_zalo text,
  p_google_maps_url text,
  p_chinh_sach text,
  p_prefer_property_when_empty boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_property_id uuid;
  v_admin_level integer;
  v_room_count integer;
  v_link_zalo text := nullif(btrim(p_link_zalo), '');
  v_google_maps_url text := nullif(btrim(p_google_maps_url), '');
  v_chinh_sach text := nullif(btrim(p_chinh_sach), '');
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select r.property_id
  into v_property_id
  from public.rooms r
  where r.id = p_room_id
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select au.level
  into v_admin_level
  from public.admin_users au
  where au.user_id = auth.uid()
  limit 1;

  if coalesce(v_admin_level, 0) not in (1, 2)
    and not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(coalesce(p_link_zalo, '')) > 2000
    or length(coalesce(p_google_maps_url, '')) > 2000
    or length(coalesce(p_chinh_sach, '')) > 10000 then
    raise exception 'INVALID_SHARED_FIELD_LENGTH' using errcode = '22023';
  end if;

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);

  if v_property_id is not null and p_prefer_property_when_empty then
    select
      coalesce(v_link_zalo, p.default_room_data->>'link_zalo'),
      coalesce(v_google_maps_url, p.google_maps_url),
      coalesce(v_chinh_sach, p.default_room_data->>'chinh_sach')
    into v_link_zalo, v_google_maps_url, v_chinh_sach
    from public.properties p
    where p.id = v_property_id;
  end if;

  if v_property_id is null then
    update public.rooms
    set
      link_zalo = v_link_zalo,
      google_maps_url = v_google_maps_url,
      chinh_sach = v_chinh_sach,
      updated_at = now()
    where id = p_room_id;
    v_room_count := 1;
  else
    update public.properties
    set
      google_maps_url = v_google_maps_url,
      default_room_data = coalesce(default_room_data, '{}'::jsonb)
        || jsonb_build_object(
          'link_zalo', v_link_zalo,
          'chinh_sach', v_chinh_sach
        ),
      updated_at = now()
    where id = v_property_id;

    update public.rooms
    set
      link_zalo = v_link_zalo,
      google_maps_url = v_google_maps_url,
      chinh_sach = v_chinh_sach,
      updated_at = now()
    where property_id = v_property_id;
    get diagnostics v_room_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'property_id', v_property_id,
    'rooms_updated', v_room_count
  );
end;
$function$;

create or replace function public.get_room_shared_property_fields_v1(
  p_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin_level integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select au.level
  into v_admin_level
  from public.admin_users au
  where au.user_id = auth.uid()
  limit 1;

  if coalesce(v_admin_level, 0) not in (1, 2)
    and not public.can_manage_room(p_room_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'property_id', r.property_id,
    'link_zalo', case
      when r.property_id is not null then p.default_room_data->>'link_zalo'
      else r.link_zalo
    end,
    'google_maps_url', case
      when r.property_id is not null then p.google_maps_url
      else r.google_maps_url
    end,
    'chinh_sach', case
      when r.property_id is not null then p.default_room_data->>'chinh_sach'
      else r.chinh_sach
    end
  )
  into v_result
  from public.rooms r
  left join public.properties p on p.id = r.property_id
  where r.id = p_room_id;

  if v_result is null then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.sync_property_shared_room_fields_v1(uuid, text, text, text)
from public, anon;
revoke all on function public.sync_room_shared_property_fields_v1(uuid, text, text, text, boolean)
from public, anon;
revoke all on function public.get_room_shared_property_fields_v1(uuid)
from public, anon;

grant execute on function public.sync_property_shared_room_fields_v1(uuid, text, text, text)
to authenticated, service_role;
grant execute on function public.sync_room_shared_property_fields_v1(uuid, text, text, text, boolean)
to authenticated, service_role;
grant execute on function public.get_room_shared_property_fields_v1(uuid)
to authenticated, service_role;

-- Safely backfill legacy property values only when all non-empty rooms in the
-- property agree. Conflicting legacy values remain untouched until the next
-- explicit admin/owner edit establishes the shared value.
with room_values as (
  select
    r.property_id,
    max(nullif(btrim(r.link_zalo), '')) as link_zalo,
    max(nullif(btrim(r.google_maps_url), '')) as google_maps_url,
    max(nullif(btrim(r.chinh_sach), '')) as chinh_sach,
    count(distinct nullif(btrim(r.link_zalo), '')) as link_zalo_variants,
    count(distinct nullif(btrim(r.google_maps_url), '')) as google_maps_url_variants,
    count(distinct nullif(btrim(r.chinh_sach), '')) as chinh_sach_variants
  from public.rooms r
  where r.property_id is not null
  group by r.property_id
)
update public.properties p
set
  google_maps_url = coalesce(
    nullif(btrim(p.google_maps_url), ''),
    case
      when rv.google_maps_url_variants <= 1 then rv.google_maps_url
      else null
    end
  ),
  default_room_data = coalesce(p.default_room_data, '{}'::jsonb)
    || jsonb_build_object(
      'link_zalo', coalesce(
        nullif(btrim(p.default_room_data->>'link_zalo'), ''),
        case when rv.link_zalo_variants <= 1 then rv.link_zalo else null end
      ),
      'chinh_sach', coalesce(
        nullif(btrim(p.default_room_data->>'chinh_sach'), ''),
        case when rv.chinh_sach_variants <= 1 then rv.chinh_sach else null end
      )
    )
from room_values rv
where rv.property_id = p.id;

update public.rooms r
set
  link_zalo = coalesce(
    nullif(btrim(p.default_room_data->>'link_zalo'), ''),
    r.link_zalo
  ),
  google_maps_url = coalesce(
    nullif(btrim(p.google_maps_url), ''),
    r.google_maps_url
  ),
  chinh_sach = coalesce(
    nullif(btrim(p.default_room_data->>'chinh_sach'), ''),
    r.chinh_sach
  ),
  updated_at = now()
from public.properties p
where p.id = r.property_id
  and (
    r.link_zalo is distinct from coalesce(
      nullif(btrim(p.default_room_data->>'link_zalo'), ''),
      r.link_zalo
    )
    or r.google_maps_url is distinct from coalesce(
      nullif(btrim(p.google_maps_url), ''),
      r.google_maps_url
    )
    or r.chinh_sach is distinct from coalesce(
      nullif(btrim(p.default_room_data->>'chinh_sach'), ''),
      r.chinh_sach
    )
  );

commit;
