begin;

create table if not exists public.room_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_user_id uuid,
  actor_role text,
  actor_display_name text,
  actor_phone text,
  action text not null,
  reason text,
  previous_lifecycle_status text,
  new_lifecycle_status text,
  previous_publish_status text,
  new_publish_status text,
  previous_is_hidden boolean,
  new_is_hidden boolean,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_lifecycle_audit_room_created_idx
  on public.room_lifecycle_audit(room_id, created_at desc);

create table if not exists public.property_ownership_audit (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  affected_user_id uuid not null,
  previous_roles text[] not null default '{}',
  actor_user_id uuid not null,
  action text not null,
  ownership_before jsonb not null default '{}'::jsonb,
  ownership_after jsonb not null default '{}'::jsonb,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists property_ownership_audit_property_created_idx
  on public.property_ownership_audit(property_id, created_at desc);

alter table public.room_lifecycle_audit enable row level security;
alter table public.property_ownership_audit enable row level security;

drop policy if exists room_lifecycle_audit_admin_l1_read on public.room_lifecycle_audit;
create policy room_lifecycle_audit_admin_l1_read on public.room_lifecycle_audit
  for select to authenticated using (coalesce(public.is_admin_l1(), false));

drop policy if exists property_ownership_audit_admin_l1_read on public.property_ownership_audit;
create policy property_ownership_audit_admin_l1_read on public.property_ownership_audit
  for select to authenticated using (coalesce(public.is_admin_l1(), false));

revoke all on public.room_lifecycle_audit, public.property_ownership_audit from public, anon, authenticated;
grant select on public.room_lifecycle_audit, public.property_ownership_audit to authenticated;
grant all on public.room_lifecycle_audit, public.property_ownership_audit to service_role;

create or replace function public.audit_room_visibility_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_source text := nullif(current_setting('app.room_audit_source', true), '');
  v_action text;
  v_reason text;
  v_actor_role text;
  v_actor_name text;
  v_actor_phone text;
  v_admin_level integer;
begin
  if old.lifecycle_status is not distinct from new.lifecycle_status
    and old.publish_status is not distinct from new.publish_status
    and old.is_hidden is not distinct from new.is_hidden then
    return new;
  end if;

  select au.level into v_admin_level
  from public.admin_users au where au.user_id = v_uid limit 1;

  if v_admin_level = 1 then
    v_actor_role := 'admin_l1';
  elsif v_admin_level = 2 then
    v_actor_role := 'admin_l2';
  else
    select pm.role into v_actor_role
    from public.property_members pm
    where pm.property_id = new.property_id and pm.user_id = v_uid and pm.status = 'active'
    order by case pm.role when 'owner' then 1 when 'manager' then 2 else 3 end
    limit 1;
  end if;

  select
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), u.email),
    coalesce(nullif(u.phone, ''), nullif(u.raw_user_meta_data->>'contact_phone', ''), nullif(u.raw_user_meta_data->>'phone', ''))
  into v_actor_name, v_actor_phone
  from auth.users u where u.id = v_uid;

  if coalesce(new.is_hidden, false) = false
    and coalesce(new.lifecycle_status, 'active') = 'active'
    and coalesce(new.publish_status, 'draft') <> 'hidden' then
    v_action := 'restored';
    v_source := coalesce(v_source, 'room_visibility_restored');
    v_reason := case
      when v_source = 'room_restored_by_admin_l1' then 'Phòng được Admin L1 công khai lại.'
      else 'Phòng được chuyển về trạng thái công khai.'
    end;
  else
    v_action := 'hidden';
    v_source := coalesce(v_source,
      case when v_actor_role = 'owner' then 'room_archived_by_owner'
           when v_actor_role = 'manager' then 'room_archived_by_manager'
           when v_actor_role = 'admin_l1' then 'room_hidden_by_admin_l1'
           when v_actor_role = 'admin_l2' then 'room_hidden_by_admin_l2'
           else 'room_visibility_hidden' end);
    v_reason := case v_source
      when 'room_archived_by_owner' then 'Bị chủ nhà xóa.'
      when 'room_archived_by_manager' then 'Bị người quản lý xóa.'
      when 'room_hidden_by_admin_l1' then 'Bị Admin L1 ẩn.'
      when 'room_hidden_by_admin_l2' then 'Bị Admin L2 ẩn.'
      when 'property_visibility_sync' then 'Bị ẩn do trạng thái xuất bản của tòa nhà thay đổi.'
      else 'Phòng được chuyển sang trạng thái ẩn.'
    end;
  end if;

  insert into public.room_lifecycle_audit (
    room_id, actor_user_id, actor_role, actor_display_name, actor_phone,
    action, reason, previous_lifecycle_status, new_lifecycle_status,
    previous_publish_status, new_publish_status, previous_is_hidden,
    new_is_hidden, source
  ) values (
    new.id, v_uid, v_actor_role, v_actor_name, v_actor_phone,
    v_action, v_reason, old.lifecycle_status, new.lifecycle_status,
    old.publish_status, new.publish_status, old.is_hidden,
    new.is_hidden, v_source
  );

  return new;
end;
$function$;

drop trigger if exists room_visibility_audit_v1 on public.rooms;
create trigger room_visibility_audit_v1
  after update of lifecycle_status, publish_status, is_hidden on public.rooms
  for each row execute function public.audit_room_visibility_change_v1();

create or replace function public.sync_property_room_publish_visibility_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.approval_status = 'approved'
    and new.lifecycle_status = 'active'
    and (old.approval_status is distinct from new.approval_status
      or old.lifecycle_status is distinct from new.lifecycle_status) then
    perform set_config('app.room_audit_source', 'property_visibility_sync', true);
    update public.rooms set publish_status = 'published', updated_at = now()
    where property_id = new.id and lifecycle_status = 'active' and publish_status = 'draft';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_admin_l1_hidden_room_update_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(public.is_admin_l1(), false)
    and pg_trigger_depth() = 1
    and (coalesce(old.is_hidden, false) or old.lifecycle_status = 'archived' or old.publish_status = 'hidden')
    and current_setting('app.allow_admin_l1_hidden_save', true) is distinct from 'true' then
    raise exception 'HIDDEN_ROOM_CONFIRMATION_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_admin_l1_hidden_room_update_v1 on public.rooms;
create trigger guard_admin_l1_hidden_room_update_v1
  before update on public.rooms
  for each row execute function public.guard_admin_l1_hidden_room_update_v1();

create or replace function public.archive_owner_room_v1(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if v_room.lifecycle_status = 'archived' then return to_jsonb(v_room); end if;
  if v_room.property_id is null or not public.can_archive_property(v_room.property_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform set_config('app.room_audit_source',
    case when exists (select 1 from public.property_members pm where pm.property_id = v_room.property_id and pm.user_id = v_uid and pm.role = 'owner' and pm.status = 'active')
      then 'room_archived_by_owner' else 'room_archived_by_manager' end, true);
  update public.rooms set lifecycle_status = 'archived', publish_status = 'hidden', is_hidden = true,
    archived_at = now(), archived_by = v_uid, updated_at = now()
  where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end;
$function$;

-- PostgreSQL không cho CREATE OR REPLACE đổi kiểu trả về của RPC đã tồn tại.
-- Bản cũ của admin_l1_delete_room trả về kiểu khác, nên cần drop theo đúng
-- signature trước khi tạo lại phiên bản soft-hide trả về jsonb.
drop function if exists public.admin_l1_delete_room(uuid);

create function public.admin_l1_delete_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid(); v_room public.rooms%rowtype;
begin
  if not coalesce(public.is_admin_l1(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(v_room.is_hidden, false) or v_room.lifecycle_status = 'archived' or v_room.publish_status = 'hidden' then
    return to_jsonb(v_room);
  end if;
  perform set_config('app.room_audit_source', 'room_hidden_by_admin_l1', true);
  update public.rooms set lifecycle_status = 'archived', publish_status = 'hidden', is_hidden = true,
    archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, v_uid), updated_at = now()
  where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end;
$function$;

create or replace function public.admin_l1_save_hidden_room_v1(
  p_room_id uuid,
  p_payload jsonb,
  p_visibility_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_before public.rooms%rowtype;
  v_result jsonb;
  v_after public.rooms%rowtype;
  v_publish_status text;
begin
  if not coalesce(public.is_admin_l1(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_visibility_action not in ('keep_hidden', 'restore') then raise exception 'INVALID_VISIBILITY_ACTION' using errcode = '22023'; end if;
  select * into v_before from public.rooms where id = p_room_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (coalesce(v_before.is_hidden, false) or v_before.lifecycle_status = 'archived' or v_before.publish_status = 'hidden') then
    raise exception 'ROOM_IS_NOT_HIDDEN' using errcode = '22023';
  end if;

  perform set_config('app.allow_admin_l1_hidden_save', 'true', true);
  v_result := public.admin_upsert_room_v1(p_room_id, p_payload);

  if p_visibility_action = 'restore' then
    select case when p.approval_status = 'approved' and p.lifecycle_status = 'active' then 'published' else 'draft' end
      into v_publish_status from public.properties p where p.id = v_before.property_id;
    perform set_config('app.room_audit_source', 'room_restored_by_admin_l1', true);
    update public.rooms set lifecycle_status = 'active', publish_status = coalesce(v_publish_status, 'draft'),
      is_hidden = false, archived_at = null, archived_by = null, updated_at = now()
    where id = p_room_id returning * into v_after;
  else
    select * into v_after from public.rooms where id = p_room_id;
    insert into public.room_lifecycle_audit (
      room_id, actor_user_id, actor_role, action, reason,
      previous_lifecycle_status, new_lifecycle_status,
      previous_publish_status, new_publish_status,
      previous_is_hidden, new_is_hidden, source
    ) values (
      p_room_id, auth.uid(), 'admin_l1', 'updated_while_hidden',
      'Admin L1 cập nhật thông tin và tiếp tục giữ phòng ở trạng thái ẩn.',
      v_before.lifecycle_status, v_after.lifecycle_status,
      v_before.publish_status, v_after.publish_status,
      v_before.is_hidden, v_after.is_hidden, 'room_updated_while_hidden_by_admin_l1'
    );
  end if;
  return to_jsonb(v_after);
end;
$function$;

create or replace function public.get_admin_l1_room_hidden_audit_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_room public.rooms%rowtype; v_audit public.room_lifecycle_audit%rowtype;
begin
  if not coalesce(public.is_admin_l1(), false) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select * into v_room from public.rooms where id = p_room_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not (coalesce(v_room.is_hidden, false) or v_room.lifecycle_status = 'archived' or v_room.publish_status = 'hidden') then
    return jsonb_build_object('is_hidden', false, 'has_audit', false);
  end if;
  select * into v_audit from public.room_lifecycle_audit
  where room_id = p_room_id and action = 'hidden' order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('is_hidden', true, 'has_audit', false);
  end if;
  return jsonb_build_object(
    'is_hidden', true, 'has_audit', true, 'reason', v_audit.reason,
    'actor_role', v_audit.actor_role, 'actor_display_name', v_audit.actor_display_name,
    'actor_phone', v_audit.actor_phone, 'source', v_audit.source,
    'occurred_at', v_audit.created_at
  );
end;
$function$;

create or replace function public.release_my_property_access_v1(p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_roles text[];
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.properties where id = p_property_id) then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  select array_agg(distinct pm.role), jsonb_build_object(
    'active_memberships', count(*) filter (where pm.status = 'active'),
    'legacy_owner_mapping', exists(select 1 from public.property_owners po where po.property_id = p_property_id and po.user_id = v_uid)
  ) into v_roles, v_before
  from public.property_members pm
  where pm.property_id = p_property_id and pm.user_id = v_uid
    and pm.status = 'active' and pm.role in ('owner', 'manager');

  if coalesce(array_length(v_roles, 1), 0) = 0 then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not (v_roles && array['owner','manager']::text[]) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  update public.property_members set status = 'revoked', updated_at = now()
    where property_id = p_property_id and user_id = v_uid
      and status = 'active' and role in ('owner', 'manager');
  delete from public.property_owners where property_id = p_property_id and user_id = v_uid;

  v_after := jsonb_build_object(
    'active_memberships', (select count(*) from public.property_members pm where pm.property_id = p_property_id and pm.user_id = v_uid and pm.status = 'active' and pm.role in ('owner', 'manager')),
    'legacy_owner_mapping', exists(select 1 from public.property_owners po where po.property_id = p_property_id and po.user_id = v_uid)
  );

  insert into public.property_ownership_audit (
    property_id, affected_user_id, previous_roles, actor_user_id,
    action, ownership_before, ownership_after, source
  ) values (
    p_property_id, v_uid, v_roles, v_uid,
    'released', v_before, v_after, 'building_ownership_released'
  );

  return jsonb_build_object('id', p_property_id, 'released', true, 'previous_roles', v_roles);
end;
$function$;

revoke all on function public.audit_room_visibility_change_v1() from public, anon, authenticated;
revoke all on function public.guard_admin_l1_hidden_room_update_v1() from public, anon, authenticated;
revoke all on function public.archive_owner_room_v1(uuid) from public, anon;
revoke all on function public.admin_l1_delete_room(uuid) from public, anon;
revoke all on function public.admin_l1_save_hidden_room_v1(uuid, jsonb, text) from public, anon;
revoke all on function public.get_admin_l1_room_hidden_audit_v1(uuid) from public, anon;
revoke all on function public.release_my_property_access_v1(uuid) from public, anon;
grant execute on function public.archive_owner_room_v1(uuid) to authenticated, service_role;
grant execute on function public.admin_l1_delete_room(uuid) to authenticated, service_role;
grant execute on function public.admin_l1_save_hidden_room_v1(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.get_admin_l1_room_hidden_audit_v1(uuid) to authenticated, service_role;
grant execute on function public.release_my_property_access_v1(uuid) to authenticated, service_role;

commit;
