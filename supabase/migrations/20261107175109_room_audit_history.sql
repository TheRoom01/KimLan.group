-- Audit snapshots deliberately omit credentials, contact fields, free-form text and media URLs.
create schema if not exists room_audit_private;
revoke all on schema room_audit_private from public, anon, authenticated, service_role;

create table public.room_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_order bigint generated always as identity,
  room_id uuid not null,
  entity text not null check (entity in ('rooms','room_details','room_media')),
  action text not null check (action in ('CREATE_ROOM','UPDATE_ROOM','MEDIA_UPDATE','HIDE_ROOM','ARCHIVE_ROOM','RESTORE_ROOM','DELETE_ROOM','PURGE_ROOM','APPROVE_IMPORT_UPDATE')),
  actor_user_id uuid,
  actor_role text not null,
  actor_display_name_snapshot text,
  source text not null,
  operation_id text not null,
  room_reference jsonb not null,
  changed_fields text[] not null,
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index room_audit_events_time_idx on public.room_audit_events (created_at desc, id desc);
create index room_audit_events_room_time_idx on public.room_audit_events (room_id, created_at desc);
create index room_audit_events_room_order_idx on public.room_audit_events (room_id, event_order desc) where entity='rooms';
create index room_audit_events_actor_time_idx on public.room_audit_events (actor_user_id, created_at desc);
create index room_audit_events_action_time_idx on public.room_audit_events (action, created_at desc);
create index room_audit_events_source_time_idx on public.room_audit_events (source, created_at desc);

alter table public.room_audit_events enable row level security;
revoke all on public.room_audit_events from public, anon, authenticated, service_role;
revoke all on sequence public.room_audit_events_event_order_seq from public, anon, authenticated, service_role;
grant select on public.room_audit_events to authenticated;
create policy room_audit_events_l1_read on public.room_audit_events
  for select to authenticated using ((select public.is_admin_l1()));

-- Keep existing lifecycle rows and the visibility/restore RPC contract even after hard delete.
alter table public.room_lifecycle_audit drop constraint room_lifecycle_audit_room_id_fkey;

create function room_audit_private.project_row(p_entity text, p_row jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_row)
  where key = any(case p_entity
    when 'rooms' then array['room_code','room_type','price','status','available_from','house_number','address','ward','district',
      'property_id','area','area_m2','lifecycle_status','publish_status','is_hidden','archived_at','badges']
    when 'room_details' then array['area','area_m2','electric_fee_value','electric_fee_unit','water_fee_value','water_fee_unit',
      'service_fee_value','service_fee_unit','parking_fee_value','parking_fee_unit','other_fee_value','has_elevator','has_stairs',
      'shared_washer','private_washer','shared_dryer','private_dryer','has_parking','has_basement','fingerprint_lock',
      'short_term','long_term','has_balcony','has_window','allow_pet','allow_cat','allow_dog','no_pet','free_time',
      'deposit_amount','deposit_months','minimum_term_months']
    when 'room_media' then array['id','type','provider','sort_order','is_cover','width','height','duration_ms']
    else array[]::text[] end);
$$;

create function room_audit_private.capture()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_row jsonb := case when TG_OP <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  new_row jsonb := case when TG_OP <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  room_row jsonb;
  room_id_value uuid;
  property_id_value uuid;
  actor uuid := auth.uid();
  actor_role_value text;
  actor_name text;
  source_value text;
  operation_value text := pg_current_xact_id()::text;
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  headers jsonb;
  action_value text;
  before_value jsonb;
  after_value jsonb;
  fields text[];
  hidden_before boolean;
  hidden_after boolean;
  restore_id text := nullif(current_setting('app.room_history_restore_event', true), '');
  private_field text;
begin
  if TG_TABLE_NAME = 'rooms' then
    room_row := case when TG_OP = 'DELETE' then old_row else new_row end;
    room_id_value := (room_row->>'id')::uuid;
  else
    room_id_value := coalesce(new_row->>'room_id', old_row->>'room_id')::uuid;
    select to_jsonb(r) into room_row from public.rooms r where r.id=room_id_value;
    -- A room deletion records child snapshots before cascades run.
    if room_row is null then return null; end if;
  end if;

  before_value := room_audit_private.project_row(TG_TABLE_NAME, old_row);
  after_value := room_audit_private.project_row(TG_TABLE_NAME, new_row);
  if TG_OP='UPDATE' then
    foreach private_field in array case TG_TABLE_NAME
      when 'rooms' then array['description','chinh_sach']
      when 'room_details' then array['other_amenities','other_fee_note','detail_json','pet_policy']
      else array[]::text[] end
    loop
      if (old_row->private_field) is distinct from (new_row->private_field) then
        before_value := before_value || jsonb_build_object(private_field, '{"redacted":"before"}'::jsonb);
        after_value := after_value || jsonb_build_object(private_field, '{"redacted":"after"}'::jsonb);
      end if;
    end loop;
  end if;
  -- Media may be replaced at the same index with identical metadata. Record only
  -- the fact of replacement, without retaining private or signed media URLs.
  if TG_TABLE_NAME = 'room_media' and TG_OP = 'UPDATE'
    and ((old_row->'url') is distinct from (new_row->'url') or (old_row->'path') is distinct from (new_row->'path')) then
    before_value := before_value || '{"media_reference_changed":false}'::jsonb;
    after_value := after_value || '{"media_reference_changed":true}'::jsonb;
  end if;

  select coalesce(array_agg(k order by k), '{}') into fields
  from (select jsonb_object_keys(before_value || after_value) as k) keys
  where (before_value->k) is distinct from (after_value->k);
  if TG_OP='UPDATE' and cardinality(fields)=0 then return null; end if;

  property_id_value := (room_row->>'property_id')::uuid;
  if pg_trigger_depth()>1 then
    actor := null;
    source_value := 'system_sync';
  elsif claims->>'role'='service_role' and current_setting('role',true)='service_role' then
    actor := null;
    headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
    if headers->>'x-room-audit-source' in ('zalo_import','zalo_automation','admin_api','owner_portal') then
      source_value := headers->>'x-room-audit-source';
      if source_value<>'zalo_automation' and headers->>'x-room-audit-actor' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        select id into actor from auth.users where id=(headers->>'x-room-audit-actor')::uuid;
      end if;
      if headers->>'x-room-audit-operation' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        operation_value := headers->>'x-room-audit-operation';
      end if;
    else
      source_value := 'service';
    end if;
  end if;

  if actor is not null then
    select case a.level when 1 then 'admin_l1' when 2 then 'admin_l2' end, nullif(btrim(a.full_name),'')
      into actor_role_value,actor_name from public.admin_users a where a.user_id=actor;
    if actor_role_value is null then
      select pm.role::text into actor_role_value from public.property_members pm
      where pm.user_id=actor and pm.property_id=property_id_value and pm.status='active' and pm.role in ('owner','manager')
      order by case when pm.role='owner' then 0 else 1 end limit 1;
    end if;
    if actor_name is null then
      select nullif(btrim(u.raw_user_meta_data->>'full_name'),'') into actor_name from auth.users u where u.id=actor;
    end if;
  end if;
  actor_role_value := coalesce(actor_role_value,case when actor is null then 'system' else 'authenticated' end);
  source_value := coalesce(source_value, case when actor_role_value in ('admin_l1','admin_l2') then 'admin'
    when actor_role_value in ('owner','manager') then 'owner_portal' when actor is null then 'system' else 'direct' end);

  if TG_TABLE_NAME='room_media' then action_value := 'MEDIA_UPDATE';
  elsif TG_TABLE_NAME='rooms' and TG_OP='INSERT' then action_value := 'CREATE_ROOM';
  elsif TG_TABLE_NAME='rooms' and TG_OP='DELETE' then
    action_value := case when actor is null and old_row->>'lifecycle_status'='archived' then 'PURGE_ROOM' else 'DELETE_ROOM' end;
    before_value := before_value || jsonb_build_object(
      'details', (select room_audit_private.project_row('room_details',to_jsonb(d)) from public.room_details d where d.room_id=room_id_value limit 1),
      'media', (select coalesce(jsonb_agg(room_audit_private.project_row('room_media',to_jsonb(m)) order by m.sort_order,m.id),'[]'::jsonb)
        from public.room_media m where m.room_id=room_id_value));
    fields := fields || array['details','media'];
  elsif TG_TABLE_NAME='rooms' and TG_OP='UPDATE' then
    hidden_before := coalesce((old_row->>'is_hidden')::boolean,false) or coalesce(old_row->>'lifecycle_status'='archived',false) or coalesce(old_row->>'publish_status'='hidden',false);
    hidden_after := coalesce((new_row->>'is_hidden')::boolean,false) or coalesce(new_row->>'lifecycle_status'='archived',false) or coalesce(new_row->>'publish_status'='hidden',false);
    action_value := case
      when new_row->>'lifecycle_status'='archived' and old_row->>'lifecycle_status' is distinct from 'archived' then 'ARCHIVE_ROOM'
      when hidden_before and not hidden_after then 'RESTORE_ROOM'
      when not hidden_before and hidden_after then 'HIDE_ROOM'
      when source_value in ('zalo_import','zalo_automation') then 'APPROVE_IMPORT_UPDATE' else 'UPDATE_ROOM' end;
    if action_value in ('HIDE_ROOM','ARCHIVE_ROOM','RESTORE_ROOM') then
      -- Keep the complete allowlisted room snapshot for lifecycle actions.
      null;
    else
      select coalesce(jsonb_object_agg(key,value),'{}') into before_value from jsonb_each(before_value) where key=any(fields);
      select coalesce(jsonb_object_agg(key,value),'{}') into after_value from jsonb_each(after_value) where key=any(fields);
    end if;
  else
    action_value := case when source_value in ('zalo_import','zalo_automation') then 'APPROVE_IMPORT_UPDATE' else 'UPDATE_ROOM' end;
    select coalesce(jsonb_object_agg(key,value),'{}') into before_value from jsonb_each(before_value) where key=any(fields);
    select coalesce(jsonb_object_agg(key,value),'{}') into after_value from jsonb_each(after_value) where key=any(fields);
  end if;
  if TG_TABLE_NAME='room_media' and TG_OP='UPDATE' then
    select coalesce(jsonb_object_agg(key,value),'{}') into before_value from jsonb_each(before_value) where key=any(fields);
    select coalesce(jsonb_object_agg(key,value),'{}') into after_value from jsonb_each(after_value) where key=any(fields);
  end if;
  if restore_id is not null and actor_role_value='admin_l1' and pg_trigger_depth()=1 then
    action_value := 'RESTORE_ROOM';
    source_value := 'history_restore';
  end if;

  insert into public.room_audit_events(room_id,entity,action,actor_user_id,actor_role,actor_display_name_snapshot,source,
    operation_id,room_reference,changed_fields,before_data,after_data)
  values(room_id_value,TG_TABLE_NAME,action_value,actor,actor_role_value,left(actor_name,160),source_value,operation_value,
    jsonb_build_object('code',room_row->'room_code','address',concat_ws(', ',nullif(concat_ws(' ',room_row->>'house_number',room_row->>'address'),''),
      room_row->>'ward',room_row->>'district'),'property_id',property_id_value) ||
      case when TG_TABLE_NAME='room_media' then jsonb_build_object('media_id',coalesce(new_row->'id',old_row->'id')) else '{}'::jsonb end ||
      case when source_value='history_restore' then jsonb_build_object('restored_event_id',restore_id) else '{}'::jsonb end,
    fields,before_value,after_value);
  if TG_WHEN='BEFORE' and TG_OP='DELETE' then return old; end if;
  return null;
end;
$$;

revoke all on all functions in schema room_audit_private from public, anon, authenticated, service_role;

create trigger room_history_rooms_write after insert or update on public.rooms
  for each row execute function room_audit_private.capture();
create trigger room_history_rooms_delete before delete on public.rooms
  for each row execute function room_audit_private.capture();
create trigger room_history_details_write after insert or update or delete on public.room_details
  for each row execute function room_audit_private.capture();
create trigger room_history_media_write after insert or update or delete on public.room_media
  for each row execute function room_audit_private.capture();

-- Deliberately allow only price and reversal of a verified visibility change.
-- Compare current values under the room lock before touching any column.
create function public.restore_room_audit_event_v1(p_event_id uuid, p_field text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event public.room_audit_events%rowtype;
  room public.rooms%rowtype;
  prior public.rooms%rowtype;
  property public.properties%rowtype;
  current_room jsonb;
  field text;
  property_to_lock uuid;
  restored_fields text[];
begin
  if auth.uid() is null or not coalesce(public.is_admin_l1(),false) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select * into event from public.room_audit_events where id=p_event_id;
  if not found then raise exception 'AUDIT_EVENT_NOT_FOUND' using errcode='P0002'; end if;
  if event.entity <> 'rooms' or not coalesce((
    (p_field='price' and event.action in ('UPDATE_ROOM','APPROVE_IMPORT_UPDATE','RESTORE_ROOM') and 'price'=any(event.changed_fields)
      and (jsonb_typeof(event.before_data->'price')='null' or
        (jsonb_typeof(event.before_data->'price')='number' and (event.before_data->>'price')::numeric>=0)))
    or (p_field='visibility' and event.action in ('HIDE_ROOM','ARCHIVE_ROOM')
      and event.before_data->>'lifecycle_status'='active'
      and event.before_data->>'is_hidden'='false' and event.before_data->>'publish_status' in ('published','draft'))
  ), false) then raise exception 'RESTORE_FIELD_UNSUPPORTED' using errcode='22023'; end if;

  if p_field='visibility' then
    property_to_lock := (event.after_data->>'property_id')::uuid;
    if property_to_lock is not null then
      select * into property from public.properties where id=property_to_lock for no key update;
      if not found then raise exception 'RESTORE_PROPERTY_UNAVAILABLE' using errcode='40001'; end if;
    end if;
  end if;
  select * into room from public.rooms where id=event.room_id for update;
  if not found then raise exception 'ROOM_NO_LONGER_EXISTS' using errcode='P0002'; end if;
  restored_fields := case p_field when 'price' then array['price']
    else array['is_hidden','lifecycle_status','publish_status','property_id','archived_at'] end;
  -- Even an edit that changed the value away and back supersedes this event.
  if exists (select 1 from public.room_audit_events newer where newer.room_id=event.room_id
    and newer.entity='rooms' and newer.event_order>event.event_order and newer.changed_fields && restored_fields)
  then raise exception 'ROOM_HISTORY_CONFLICT' using errcode='40001'; end if;
  current_room := room_audit_private.project_row('rooms',to_jsonb(room));
  prior := jsonb_populate_record(null::public.rooms,event.before_data);

  if p_field='price' then
    if current_room->'price' is distinct from event.after_data->'price' then
      raise exception 'ROOM_HISTORY_CONFLICT' using errcode='40001';
    end if;
  else
    foreach field in array restored_fields loop
      if current_room->field is distinct from event.after_data->field then
        raise exception 'ROOM_HISTORY_CONFLICT' using errcode='40001';
      end if;
    end loop;
    if prior.property_id is distinct from room.property_id
      or (property_to_lock is not null and property.lifecycle_status is distinct from 'active')
      or (prior.publish_status='published' and (property_to_lock is null or property.approval_status is distinct from 'approved'))
    then raise exception 'RESTORE_PROPERTY_UNAVAILABLE' using errcode='40001'; end if;
    if room.lifecycle_status='archived' and nullif(btrim(room.room_code),'') is not null
      and exists (select 1 from public.rooms active_room where active_room.property_id=room.property_id
        and active_room.id<>room.id and active_room.lifecycle_status='active'
        and lower(btrim(active_room.room_code))=lower(btrim(room.room_code)))
    then raise exception 'ROOM_HISTORY_CONFLICT' using errcode='40001'; end if;
  end if;

  perform set_config('app.room_history_restore_event',event.id::text,true);
  perform set_config('app.allow_admin_l1_hidden_save','true',true);
  if p_field='price' then
    update public.rooms set price=prior.price,updated_at=now() where id=room.id;
  else
    perform set_config('app.room_audit_source','room_restored_by_admin_l1',true);
    update public.rooms set is_hidden=false,lifecycle_status='active',publish_status=prior.publish_status,
      archived_at=null,archived_by=null,updated_at=now() where id=room.id;
    perform set_config('app.room_audit_source','',true);
  end if;
  perform set_config('app.room_history_restore_event','',true);
  perform set_config('app.allow_admin_l1_hidden_save','',true);
  return room.id;
end;
$$;
revoke all on function public.restore_room_audit_event_v1(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.restore_room_audit_event_v1(uuid,text) to authenticated;

create function public.room_audit_today_v1()
returns table(total bigint, updates bigint, removals bigint, restores bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*),
    count(*) filter (where action in ('UPDATE_ROOM','APPROVE_IMPORT_UPDATE','MEDIA_UPDATE')),
    count(*) filter (where action in ('HIDE_ROOM','ARCHIVE_ROOM','DELETE_ROOM','PURGE_ROOM')),
    count(*) filter (where action='RESTORE_ROOM')
  from public.room_audit_events
  where public.is_admin_l1()
    and created_at >= (date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
$$;
revoke all on function public.room_audit_today_v1() from public, anon, authenticated, service_role;
grant execute on function public.room_audit_today_v1() to authenticated;
