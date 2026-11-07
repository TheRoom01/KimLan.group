begin;

-- Do not drop legacy media-touch events unless the separate history has its
-- own row-level media capture enabled.
do $block$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.room_media'::regclass
    and tgname = 'room_history_media_write' and tgfoid = to_regprocedure('room_audit_private.capture()')
    and tgenabled in ('O','A') and not tgisinternal) then
    raise exception 'Room History media capture must be enabled before optimizing owner audit';
  end if;
end;
$block$;

-- Compact operational audit. Existing records keep their payloads and have no expiry.
alter table public.owner_audit_logs
  add column if not exists actor_name text,
  add column if not exists changed_fields text[],
  add column if not exists operation_id text,
  add column if not exists expires_at timestamptz,
  add column if not exists retention_hold boolean not null default false;

alter table public.owner_audit_logs drop constraint if exists owner_audit_logs_source_check;
alter table public.owner_audit_logs add constraint owner_audit_logs_source_check check (source in (
  'owner_portal', 'admin_l1', 'admin_l2', 'system', 'rpc',
  'manual', 'owner', 'manager', 'cron', 'zalo_imports', 'batch'
)) not valid;

create index if not exists owner_audit_logs_expiry_idx on public.owner_audit_logs (expires_at, id)
  where expires_at is not null and not retention_hold;
create unique index if not exists owner_audit_logs_media_operation_idx on public.owner_audit_logs (entity_id, operation_id)
  where action = 'room_media_changed';

drop policy if exists owner_audit_logs_select on public.owner_audit_logs;
create policy owner_audit_logs_select on public.owner_audit_logs for select to authenticated
  using (public.is_admin_l1() or (expires_at is null and public.can_view_property(property_id)));

create schema if not exists owner_audit_private;
revoke all on schema owner_audit_private from public, anon, authenticated, service_role;

-- Context belongs to the current database transaction. Only trusted routines
-- can write it, and rolling back their work also rolls back the context.
create table owner_audit_private.transaction_source (
  transaction_id xid8 primary key,
  source text not null check (source in ('cron', 'sync', 'restore', 'staff_manual'))
);
revoke all on table owner_audit_private.transaction_source from public, anon, authenticated, service_role;

create function owner_audit_private.set_source(p_source text)
returns text language plpgsql security definer set search_path = '' as $function$
declare
  transaction_key xid8 := pg_current_xact_id();
  previous_source text;
begin
  select s.source into previous_source
  from owner_audit_private.transaction_source s where s.transaction_id = transaction_key;

  if p_source is null then
    delete from owner_audit_private.transaction_source where transaction_id = transaction_key;
  else
    insert into owner_audit_private.transaction_source (transaction_id, source)
    values (transaction_key, p_source)
    on conflict (transaction_id) do update set source = excluded.source;
  end if;
  return previous_source;
end;
$function$;
revoke all on function owner_audit_private.set_source(text) from public, anon, authenticated, service_role;
-- The availability RPC is SECURITY INVOKER and is also callable by service_role.
grant usage on schema owner_audit_private to service_role;
grant execute on function owner_audit_private.set_source(text) to service_role;

-- Instrument the deployed bodies in place to retain each routine's OID, ACL,
-- signature and security mode. Abort on unexpected control flow or drift.
create function owner_audit_private.instrument_source(p_function regprocedure, p_source text)
returns void language plpgsql set search_path = '' as $function$
declare
  original text;
  body text;
  definition text;
  return_count int;
  declare_pattern constant text := $pattern$^[[:blank:]]*declare\M$pattern$;
  begin_pattern constant text := $pattern$^[[:blank:]]*begin[[:blank:]]*$$pattern$;
  return_pattern constant text := $pattern$^([[:blank:]]*)return[[:blank:]]+$pattern$;
  finish_statement constant text := '  perform owner_audit_private.set_source(v_audit_previous_source);';
begin
  select replace(p.prosrc, E'\r\n', E'\n'), replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')
  into original, definition
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = p_function and l.lanname = 'plpgsql';
  return_count := regexp_count(original, $pattern$\mreturn\M$pattern$, 1, 'i');
  if original is null or strpos(definition, original) = 0
    or regexp_count(original, declare_pattern, 1, 'in') <> 1
    or regexp_count(original, begin_pattern, 1, 'in') <> 1
    or return_count > 1 or return_count <> regexp_count(original, return_pattern, 1, 'in') then
    raise exception 'Unexpected audit entry point definition: %', p_function;
  end if;

  body := regexp_replace(original, declare_pattern, E'declare\n  v_audit_previous_source text;', 'in');
  body := regexp_replace(body, begin_pattern,
    format(E'begin\n  v_audit_previous_source := owner_audit_private.set_source(%L);', p_source), 'in');
  if return_count = 1 then
    body := regexp_replace(body, return_pattern, finish_statement || E'\n\\1return ', 'in');
  else
    if body !~* $pattern$\n[[:blank:]]*end;[[:space:]]*$$pattern$ then
      raise exception 'Unexpected audit entry point ending: %', p_function;
    end if;
    body := regexp_replace(body, $pattern$(\n[[:blank:]]*end;[[:space:]]*)$$pattern$, E'\n' || finish_statement || E'\\1', 'i');
  end if;
  execute replace(definition, original, body);
end;
$function$;
revoke all on function owner_audit_private.instrument_source(regprocedure, text) from public, anon, authenticated, service_role;

create or replace function owner_audit_private.capture()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  old_row jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  new_row jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  row_value jsonb := coalesce(new_row, old_row);
  before_value jsonb;
  after_value jsonb;
  old_default jsonb;
  new_default jsonb;
  fields text[] := '{}';
  audit_values text[];
  fields_30 text[] := '{}';
  fields_60 text[] := '{}';
  fields_90 text[] := '{}';
  field_name text;
  contact_key text;
  entity_value text;
  entity_uuid uuid;
  property_uuid uuid;
  legacy_room_owner uuid;
  actor uuid := auth.uid();
  role_value text;
  name_value text;
  action_value text;
  audit_context text;
  source_value text;
  inherited_sync boolean;
  operation_value text;
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  headers jsonb;
  expiry_days int := 30;
  event_time timestamptz := clock_timestamp();
  restored_room boolean := false;
  uuid_pattern constant text := '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';
begin
  select s.source into audit_context from owner_audit_private.transaction_source s
  where s.transaction_id = pg_current_xact_id_if_assigned();
  source_value := case audit_context when 'cron' then 'cron' when 'sync' then 'system' end;
  inherited_sync := audit_context = 'sync';
  if audit_context = 'cron' then actor := null; end if;
  entity_uuid := (row_value->>'id')::uuid;
  case TG_TABLE_NAME
  when 'rooms' then
    entity_value := 'room';
    property_uuid := (row_value->>'property_id')::uuid;
    legacy_room_owner := coalesce(old_row->>'owner_id',new_row->>'owner_id')::uuid;
    restored_room := TG_OP = 'UPDATE' and audit_context is not distinct from 'restore';
    fields_30 := array['room_type','room_code','status','lat','lng','google_maps_url','badges','publish_status','property_id','owner_id'];
    fields_60 := array['available_from','is_hidden','lifecycle_status'];
    fields_90 := array['zalo_phone','link_zalo','chinh_sach','address','house_number','ward','district'];
    audit_values := fields_90 || array['property_id','owner_id','status','available_from','is_hidden','lifecycle_status','publish_status'];
    if TG_OP = 'INSERT' then action_value := 'room_created';
    elsif TG_OP = 'DELETE' then action_value := 'room_deleted';
    elsif restored_room then action_value := 'room_restored';
    elsif (old_row->'lifecycle_status') is distinct from (new_row->'lifecycle_status') then
      action_value := case new_row->>'lifecycle_status' when 'archived' then 'room_archived' else 'room_restored' end;
    elsif old_row->>'is_hidden' = 'true' and new_row->>'is_hidden' = 'false' then action_value := 'room_restored';
    elsif (old_row->'publish_status') is distinct from (new_row->'publish_status') then action_value := 'room_publish_changed';
    else action_value := 'room_updated'; end if;

  when 'room_media' then
    entity_value := 'room';
    entity_uuid := (row_value->>'room_id')::uuid;
    select r.property_id, r.owner_id into property_uuid, legacy_room_owner from public.rooms r where r.id = entity_uuid;
    if not found then return null; end if;
    if TG_OP = 'UPDATE' and not exists (
      select 1 from unnest(array['room_id','type','provider','sort_order','is_cover','width','height','duration_ms','url','path']) f(key)
      where (old_row->key) is distinct from (new_row->key)
    ) then
      return null;
    end if;
    action_value := 'room_media_changed';
    fields := array['media'];

  when 'properties' then
    entity_value := 'property';
    property_uuid := entity_uuid;
    fields_30 := array['name','latitude','longitude','google_maps_url','default_room_data','normalized_property_key','code','code_aliases',
      'property_key','cover_image','gallery_images','note','status','lifecycle_status'];
    fields_90 := array['address','house_number','ward','district','city','phone','zalo_phone','link_zalo','chinh_sach','approval_status','approval_note',
      'default_room_data.zalo_phone','default_room_data.link_zalo','default_room_data.chinh_sach'];
    audit_values := fields_90 || array['lifecycle_status','status'];
    if TG_OP = 'INSERT' then action_value := 'property_created';
    elsif TG_OP = 'DELETE' then action_value := 'property_deleted_permanently';
    elsif (old_row->'approval_status') is distinct from (new_row->'approval_status') then
      action_value := case new_row->>'approval_status' when 'pending' then 'property_submitted'
        when 'approved' then 'property_approved' when 'rejected' then 'property_rejected' else 'property_updated' end;
    elsif (old_row->'lifecycle_status') is distinct from (new_row->'lifecycle_status') then
      action_value := case new_row->>'lifecycle_status' when 'archived' then 'property_archived'
        when 'inactive' then 'property_inactivated' when 'active' then 'property_restored' else 'property_updated' end;
    else action_value := 'property_updated'; end if;
    -- Normalize only the projected values, with no change to source rows.
    old_default := old_row->'default_room_data';
    new_default := new_row->'default_room_data';
    foreach contact_key in array array['zalo_phone','link_zalo','chinh_sach'] loop
      if (old_default->contact_key) is distinct from (new_default->contact_key) then
        if old_default ? contact_key then old_row := old_row || jsonb_build_object('default_room_data.' || contact_key, old_default->contact_key); end if;
        if new_default ? contact_key then new_row := new_row || jsonb_build_object('default_room_data.' || contact_key, new_default->contact_key); end if;
      end if;
    end loop;
    if old_row is not null then
      old_row := old_row - 'default_room_data' || jsonb_build_object('default_room_data', case when jsonb_typeof(old_default) = 'object'
        then nullif(old_default - array['description','zalo_phone','link_zalo','chinh_sach'], '{}'::jsonb) end);
    end if;
    if new_row is not null then
      new_row := new_row - 'default_room_data' || jsonb_build_object('default_room_data', case when jsonb_typeof(new_default) = 'object'
        then nullif(new_default - array['description','zalo_phone','link_zalo','chinh_sach'], '{}'::jsonb) end);
    end if;

  when 'property_members' then
    entity_value := 'property_member';
    property_uuid := (row_value->>'property_id')::uuid;
    fields_90 := array['property_id','user_id','role','status'];
    audit_values := fields_90;
    expiry_days := 90;
    if TG_OP = 'INSERT' then action_value := 'member_added';
    elsif TG_OP = 'DELETE' then action_value := 'member_deleted_permanently';
    elsif (old_row->'role') is distinct from (new_row->'role') then action_value := 'member_role_changed';
    elsif (old_row->'status') is distinct from (new_row->'status') then
      action_value := case new_row->>'status' when 'suspended' then 'member_suspended'
        when 'revoked' then 'member_revoked' when 'active' then 'member_activated' else 'member_updated' end;
    else action_value := 'member_updated'; end if;

  when 'rental_contracts' then
    entity_value := 'contract';
    select r.property_id, r.owner_id into property_uuid, legacy_room_owner from public.rooms r where r.id = (row_value->>'room_id')::uuid;
    fields_30 := array['deposit_amount','booking_status','booking_total_amount'];
    fields_90 := array['room_id','start_date','end_date','monthly_price','status','note','deleted_at','contract_type'];
    audit_values := fields_30 || array['room_id','start_date','end_date','monthly_price','status','deleted_at','contract_type'];
    if TG_OP = 'INSERT' then
      action_value := 'contract_created';
      expiry_days := case when row_value->>'contract_type' = 'deposit' then 30 else 90 end;
    elsif TG_OP = 'DELETE' then action_value := 'contract_deleted'; expiry_days := 90;
    else action_value := 'contract_updated'; end if;

  when 'contract_tenants' then
    entity_value := 'tenant';
    select r.property_id, r.owner_id into property_uuid, legacy_room_owner from public.rental_contracts c join public.rooms r on r.id = c.room_id
      where c.id = (row_value->>'contract_id')::uuid;
    fields_30 := array['contract_id','tenant_id','role'];
    audit_values := fields_30;
    if TG_OP = 'INSERT' then action_value := 'tenant_added_to_contract';
    elsif TG_OP = 'DELETE' then action_value := 'tenant_removed_from_contract'; expiry_days := 90;
    else action_value := 'contract_tenant_updated'; expiry_days := 90; end if;

  else
    raise exception 'Unsupported owner audit source table %', TG_TABLE_NAME;
  end case;

  if TG_OP = 'INSERT' and TG_TABLE_NAME in ('rooms','properties') then
    -- Creation lasts 30 days. Initial private values and state defaults are
    -- available on the entity, and do not count as separately audited edits.
    fields_60 := '{}';
    fields_90 := '{}';
  end if;
  row_value := coalesce(new_row, old_row);
  foreach field_name in array fields_30 || fields_60 || fields_90 loop
    if (old_row->field_name) is not distinct from (new_row->field_name) then continue; end if;
    if TG_OP <> 'UPDATE' and coalesce(row_value->field_name, 'null'::jsonb) = 'null'::jsonb then continue; end if;
    fields := array_append(fields, field_name);
  end loop;
  if TG_OP = 'UPDATE' and cardinality(fields) = 0 and not restored_room then return null; end if;

  if source_value is distinct from 'cron'
    and claims->>'role' = 'service_role' and current_setting('role', true) = 'service_role' then
    headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    case headers->>'x-room-audit-source'
      when 'zalo_import' then source_value := coalesce(source_value, 'zalo_imports');
      when 'admin_api' then source_value := coalesce(source_value, 'manual');
      when 'zalo_automation' then source_value := coalesce(source_value, 'system');
      when 'batch' then source_value := coalesce(source_value, 'batch');
      else null;
    end case;
    if headers->>'x-room-audit-source' in ('zalo_import','admin_api','owner_portal','batch') then
      if headers->>'x-room-audit-actor' ~* uuid_pattern then
        select id into actor from auth.users where id = (headers->>'x-room-audit-actor')::uuid;
      end if;
      if headers->>'x-room-audit-operation' ~* uuid_pattern then operation_value := headers->>'x-room-audit-operation'; end if;
    end if;
  end if;
  if pg_trigger_depth() > 1 and source_value is distinct from 'cron' then source_value := 'system'; end if;

  if actor is not null then
    select case a.level when 1 then 'admin_l1' when 2 then 'admin_l2' end, nullif(btrim(a.full_name),'')
      into role_value, name_value from public.admin_users a where a.user_id = actor;
    if role_value is null then
      select pm.role::text into role_value from public.property_members pm
        where pm.user_id = actor and pm.property_id in (property_uuid, (old_row->>'property_id')::uuid) and pm.status = 'active'
        order by case pm.role::text when 'owner' then 0 when 'manager' then 1 else 2 end limit 1;
      if role_value is null and entity_value = 'property_member' and old_row->>'user_id' = actor::text
        and old_row->>'status' = 'active' then role_value := old_row->>'role'; end if;
      if legacy_room_owner = actor and (role_value is null or role_value = 'viewer') then role_value := 'owner'; end if;
    end if;
    if name_value is null then
      select nullif(btrim(p.full_name),'') into name_value from public.owner_portal_profiles p where p.user_id = actor;
    end if;
  end if;
  role_value := coalesce(role_value, case when actor is null then 'system' else 'authenticated' end);
  source_value := coalesce(source_value, case role_value when 'owner' then 'owner' when 'manager' then 'manager'
    when 'system' then 'system' else 'manual' end);

  if TG_OP = 'UPDATE' and source_value in ('system','cron','batch') then
    fields := array(select key from unnest(fields) as f(key) where key not in ('lat','lng','latitude','longitude'));
    if pg_trigger_depth() > 1 and fields = array['google_maps_url'] then return null; end if;
    if cardinality(fields) = 0 and not restored_room then return null; end if;
  end if;

  if TG_OP = 'UPDATE' then
    if entity_value = 'room' and inherited_sync then
      -- The originating building event keeps actual contact/policy/address
      -- values. Propagated copies are recorded as 30-day marks on each room.
      audit_values := array(select key from unnest(audit_values) f(key) where key not in
        ('zalo_phone','link_zalo','chinh_sach','address','house_number','ward','district'));
    elsif entity_value = 'contract' and 'deposit' in (old_row->>'contract_type', new_row->>'contract_type')
      and fields && array['booking_status','contract_type']
      and fields <@ (fields_30 || array['status','contract_type']) then
      -- Booking cancellation/check-in updates its companion contract status.
      expiry_days := 30;
    elsif fields && fields_90 then expiry_days := greatest(expiry_days, 90);
    elsif fields && fields_60 and source_value <> 'cron' then
      if action_value = 'room_restored' then
        if 'available_from' = any(fields) then expiry_days := greatest(expiry_days, 60); end if;
      else expiry_days := greatest(expiry_days, 60); end if;
    end if;
  elsif TG_OP = 'DELETE' and entity_value in ('room','property') and TG_TABLE_NAME <> 'room_media' then
    expiry_days := 90;
  end if;

  select jsonb_object_agg(key, old_row->key) filter (where old_row ? key),
         jsonb_object_agg(key, new_row->key) filter (where new_row ? key)
    into before_value, after_value from unnest(fields) as f(key) where key = any(audit_values);

  -- AFTER DELETE can see the deleted building or cascaded parents already gone.
  if property_uuid is not null and not exists (select 1 from public.properties p where p.id = property_uuid) then
    property_uuid := null;
  end if;
  operation_value := coalesce(operation_value, pg_current_xact_id()::text);

  insert into public.owner_audit_logs (property_id, actor_id, actor_role, actor_name, entity_type, entity_id, action,
      old_data, new_data, source, created_at, changed_fields, expires_at, operation_id)
    values (property_uuid, actor, role_value, name_value, entity_value, entity_uuid, action_value,
      before_value, after_value, source_value, event_time, fields, event_time + make_interval(days => expiry_days), operation_value)
    on conflict (entity_id, operation_id) where action = 'room_media_changed' do nothing;
  return null;
end;
$function$;

revoke all on function owner_audit_private.capture() from public, anon, authenticated, service_role;

-- Creation runs with the admin's own session. Attach Imports provenance to
-- that audit event when the trusted server marks the matching Pending approved.
create or replace function owner_audit_private.link_zalo_create()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  operation_value text := headers->>'x-room-audit-operation';
begin
  if current_setting('role', true) is distinct from 'service_role'
    or (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role') is distinct from 'service_role'
    or headers->>'x-room-audit-source' is distinct from 'zalo_import'
    or headers->>'x-room-audit-actor' is distinct from new.approved_by::text
    or not exists (select 1 from public.admin_users a where a.user_id = new.approved_by and a.level in (1, 2)) then
    return null;
  end if;

  if operation_value !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    operation_value := null;
  end if;
  update public.owner_audit_logs a
    set source = 'zalo_imports', operation_id = coalesce(operation_value, a.operation_id)
  where a.id = (
    select l.id from public.owner_audit_logs l
    where l.entity_type = 'room' and l.entity_id = new.approved_room_id
      and l.action = 'room_created' and l.source = 'manual' and l.actor_id = new.approved_by
      and l.expires_at is not null
    order by l.created_at desc, l.id desc limit 1
  ) and a.source = 'manual';
  return null;
end;
$function$;

revoke all on function owner_audit_private.link_zalo_create() from public, anon, authenticated, service_role;

create trigger trg_link_zalo_create_audit after update of status on public.pending_room_versions
  for each row when (
    old.status is distinct from new.status and new.status = 'Đã duyệt'
    and old.approved_room_id is null and new.approved_room_id is not null
    and old.matched_room_id is distinct from new.approved_room_id
    and new.approved_by is not null
  ) execute function owner_audit_private.link_zalo_create();

select owner_audit_private.instrument_source(signature::regprocedure, source)
from (values
  ('public.activate_due_room_availability_v1()', 'cron'),
  ('public.purge_owner_trash_v1()', 'cron'),
  ('public.sync_property_shared_room_fields_v1(uuid,text,text,text)', 'sync'),
  ('public.sync_room_shared_property_fields_v1(uuid,text,text,text,boolean)', 'sync'),
  ('public.sync_admin_room_ward_to_property_v1(uuid,text)', 'sync'),
  ('public.restore_room_audit_event_v1(uuid,text)', 'restore')
) entry_points(signature, source);

-- Take the existing audit trigger names, leaving prior function definitions in
-- place for a rollback. Media is a per-operation marker separate from restore.
drop trigger if exists trg_audit_rooms_changes on public.rooms;
create trigger trg_audit_rooms_changes after insert or update or delete on public.rooms
  for each row execute function owner_audit_private.capture();

drop trigger if exists trg_audit_properties_changes on public.properties;
create trigger trg_audit_properties_changes after insert or update or delete on public.properties
  for each row execute function owner_audit_private.capture();

drop trigger if exists trg_audit_property_members_changes on public.property_members;
create trigger trg_audit_property_members_changes after insert or update or delete on public.property_members
  for each row execute function owner_audit_private.capture();

drop trigger if exists trg_audit_contract_changes on public.rental_contracts;
create trigger trg_audit_contract_changes after insert or update or delete on public.rental_contracts
  for each row execute function owner_audit_private.capture();

drop trigger if exists trg_audit_contract_tenant_changes on public.contract_tenants;
create trigger trg_audit_contract_tenant_changes after insert or update or delete on public.contract_tenants
  for each row execute function owner_audit_private.capture();

drop trigger if exists trg_audit_room_media_changes on public.room_media;
create trigger trg_audit_room_media_changes after insert or update or delete on public.room_media
  for each row execute function owner_audit_private.capture();

commit;
