begin;

alter table public.rental_contracts add column if not exists deleted_at timestamptz;
alter table public.rental_contracts add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.rental_contracts add column if not exists purge_after timestamptz;
alter table public.rental_contracts add column if not exists trash_previous_status text;
create index if not exists rental_contracts_deleted_at_idx on public.rental_contracts(deleted_at) where deleted_at is not null;

create or replace function public.trash_owner_contract_v1(p_contract_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_contract public.rental_contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
  select * into v_contract from public.rental_contracts where id=p_contract_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if not public.can_manage_room(v_contract.room_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if v_contract.deleted_at is not null then return to_jsonb(v_contract); end if;
  update public.rental_contracts set trash_previous_status=status, status='cancelled', deleted_at=now(),
    deleted_by=auth.uid(), purge_after=now()+interval '20 days'
  where id=p_contract_id returning * into v_contract;
  return to_jsonb(v_contract);
end $f$;

create or replace function public.restore_owner_trash_v1(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_room public.rooms%rowtype; v_contract public.rental_contracts%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
  if p_entity_type='room' then
    select * into v_room from public.rooms where id=p_entity_id for update;
    if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    if not public.can_manage_room(p_entity_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
    if v_room.lifecycle_status<>'archived' then return to_jsonb(v_room); end if;
    perform set_config('app.allow_admin_l1_hidden_save','true',true);
    perform set_config('app.room_audit_source','room_visibility_restored',true);
    update public.rooms set lifecycle_status='active',publish_status='draft',is_hidden=false,
      archived_at=null,archived_by=null,updated_at=now() where id=p_entity_id returning * into v_room;
    return to_jsonb(v_room);
  elsif p_entity_type='contract' then
    select * into v_contract from public.rental_contracts where id=p_entity_id for update;
    if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    if not public.can_manage_room(v_contract.room_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
    update public.rental_contracts set status=coalesce(trash_previous_status,'cancelled'),deleted_at=null,
      deleted_by=null,purge_after=null,trash_previous_status=null where id=p_entity_id returning * into v_contract;
    return to_jsonb(v_contract);
  end if;
  raise exception 'INVALID_ENTITY_TYPE' using errcode='22023';
end $f$;

create or replace function public.purge_owner_trash_v1()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_room record; v_contract record; v_rooms int:=0; v_contracts int:=0;
begin
  for v_contract in select id from public.rental_contracts where deleted_at is not null and purge_after<=now() loop
    delete from public.room_monthly_revenues where contract_id=v_contract.id;
    delete from public.rental_contracts where id=v_contract.id;
    v_contracts:=v_contracts+1;
  end loop;
  for v_room in select id from public.rooms where lifecycle_status='archived' and archived_at<=now()-interval '20 days' loop
    update public.pending_room_versions set matched_room_id=case when matched_room_id=v_room.id then null else matched_room_id end,
      approved_room_id=case when approved_room_id=v_room.id then null else approved_room_id end
      where matched_room_id=v_room.id or approved_room_id=v_room.id;
    update public.zalo_import_images set copied_room_id=null where copied_room_id=v_room.id;
    delete from public.room_monthly_revenues where room_id=v_room.id;
    delete from public.rental_contracts where room_id=v_room.id;
    delete from public.rooms_gallery_legacy where id=v_room.id;
    delete from public.rooms where id=v_room.id;
    v_rooms:=v_rooms+1;
  end loop;
  return jsonb_build_object('rooms',v_rooms,'contracts',v_contracts);
end $f$;

revoke all on function public.trash_owner_contract_v1(uuid) from public,anon;
revoke all on function public.restore_owner_trash_v1(text,uuid) from public,anon;
revoke all on function public.purge_owner_trash_v1() from public,anon,authenticated;
grant execute on function public.trash_owner_contract_v1(uuid) to authenticated,service_role;
grant execute on function public.restore_owner_trash_v1(text,uuid) to authenticated,service_role;
grant execute on function public.purge_owner_trash_v1() to service_role;

create extension if not exists pg_cron with schema extensions;
do $do$ begin
  if exists(select 1 from cron.job where jobname='purge-owner-trash-daily') then perform cron.unschedule('purge-owner-trash-daily'); end if;
  perform cron.schedule('purge-owner-trash-daily','17 3 * * *','select public.purge_owner_trash_v1();');
end $do$;

commit;
