-- Deployment script, deliberately NOT executed against production by Codex.
-- Reuses Pending JSON; no new tables/columns and no rewrite of existing drafts.
begin;

create unique index if not exists pending_zalo_room_identity_active_uq
  on public.pending_room_versions ((room_payload->'_room_import'->>'identity_key'))
  where status in ('Chờ duyệt', 'Trùng phòng', 'Cần xác minh')
    and room_payload->'_room_import'->>'identity_key' is not null
    and coalesce(room_payload->>'is_test_import', 'false') <> 'true';

create or replace function public.approve_zalo_room_update_v1(
  p_pending_id uuid, p_actor_id uuid, p_selected_fields text[],
  p_expected_payload jsonb, p_expected_detail jsonb, p_media jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_pending public.pending_room_versions%rowtype;
  v_room public.rooms%rowtype;
  v_detail public.room_details%rowtype;
  v_review jsonb; v_snapshot jsonb; v_key text; v_scope text; v_field text;
  v_room_patch jsonb := '{}'::jsonb; v_detail_patch jsonb := '{}'::jsonb;
  v_set text; v_detail_exists boolean; v_media_count integer;
begin
  if p_actor_id is null or cardinality(p_selected_fields) is null or cardinality(p_selected_fields) = 0 then
    raise exception 'EMPTY_SELECTION: Hãy chọn trường cần cập nhật.';
  end if;
  select * into v_pending from public.pending_room_versions where id = p_pending_id for update;
  if not found or v_pending.status not in ('Chờ duyệt', 'Trùng phòng') then raise exception 'PENDING_CHANGED: Pending không còn chờ duyệt.'; end if;
  if coalesce(v_pending.room_payload->>'is_test_import', 'false') = 'true'
     or exists(select 1 from public.zalo_import_batches where id = v_pending.batch_id and parser_result->>'test_import' = 'true') then
    raise exception 'TEST_IMPORT_FORBIDDEN';
  end if;
  if v_pending.room_payload is distinct from p_expected_payload or coalesce(v_pending.detail_payload, '{}'::jsonb) is distinct from p_expected_detail then
    raise exception 'PENDING_CHANGED: Bản nháp đã thay đổi. Hãy tải lại.';
  end if;
  v_review := v_pending.room_payload->'_room_import';
  v_snapshot := v_review->'snapshot';
  if v_review->>'type' is distinct from 'UPDATE' or v_snapshot is null or v_snapshot->'room'->>'id' is distinct from v_pending.matched_room_id::text then
    raise exception 'INVALID_UPDATE_TARGET: Cần xác minh lại phòng đích.';
  end if;
  select * into v_room from public.rooms where id = v_pending.matched_room_id for update;
  if not found then raise exception 'TARGET_ROOM_MISSING: Phòng đích đã bị xóa.'; end if;
  if (to_jsonb(v_room)->>'deleted_at') is not null or coalesce(to_jsonb(v_room)->>'lifecycle_status', 'active') <> 'active' then
    raise exception 'INVALID_UPDATE_TARGET: Phòng đích đã lưu trữ/xóa; cần kiểm tra lại.';
  end if;
  select * into v_detail from public.room_details where room_id = v_room.id for update;
  v_detail_exists := found;
  if exists(select 1 from jsonb_each(v_snapshot->'room') e where to_jsonb(v_room)->e.key is distinct from e.value)
    or (v_snapshot->'detail' = 'null'::jsonb and v_detail_exists)
    or (v_snapshot->'detail' <> 'null'::jsonb and not v_detail_exists)
    or exists(select 1 from jsonb_each(nullif(v_snapshot->'detail', 'null'::jsonb)) e where to_jsonb(v_detail)->e.key is distinct from e.value) then
    raise exception 'ROOM_CHANGED: Dữ liệu phòng đã đổi sau khi tạo Pending. Hãy phân tích lại và kiểm tra.';
  end if;
  -- Lock and compare the media manifest too; URLs/counts are not content hashes.
  perform 1 from public.room_media where room_id = v_room.id order by id for update;
  select count(*) into v_media_count from public.room_media where room_id = v_room.id;
  if v_media_count <> jsonb_array_length(v_snapshot->'media') or exists(
    select 1 from jsonb_array_elements(v_snapshot->'media') old_media
    where not exists(select 1 from public.room_media m where m.room_id = v_room.id and m.id::text = old_media->>'id'
      and not exists(select 1 from jsonb_each(old_media - 'content_hash') e where to_jsonb(m)->e.key is distinct from e.value))
  ) then raise exception 'ROOM_CHANGED: Album phòng đã thay đổi. Hãy kiểm tra lại.'; end if;

  foreach v_key in array p_selected_fields loop
    if v_key in ('images', 'videos') then continue; end if;
    v_scope := split_part(v_key, '.', 1); v_field := split_part(v_key, '.', 2);
    if not (coalesce(v_review->'presence', '{}'::jsonb) ? v_key) or coalesce(v_review->'uncertain_fields', '[]'::jsonb) ? v_key then
      raise exception 'MISSING_NEW_VALUE: Trường không có dữ liệu mới đã xác minh.';
    end if;
    if v_scope = 'room' and v_field = any(array['room_type','ward','price','status','available_from','description','chinh_sach']) then
      v_room_patch := v_room_patch || jsonb_build_object(v_field, v_pending.room_payload->v_field);
    elsif v_scope = 'detail' and v_field = any(array[
      'electric_fee_value','electric_fee_unit','water_fee_value','water_fee_unit','service_fee_value','service_fee_unit',
      'parking_fee_value','parking_fee_unit','other_fee_value','other_fee_note','has_elevator','has_stairs','shared_washer',
      'private_washer','shared_dryer','private_dryer','has_parking','has_basement','fingerprint_lock','free_time','allow_pet',
      'allow_cat','allow_dog','no_pet','short_term','long_term','other_amenities','detail_json','has_balcony','has_window']) then
      v_detail_patch := v_detail_patch || jsonb_build_object(v_field, v_pending.detail_payload->v_field);
    else raise exception 'INVALID_FIELD: Trường không được phép cập nhật.';
    end if;
  end loop;
  if v_room_patch <> '{}'::jsonb then
    select string_agg(format('%1$I = (jsonb_populate_record(null::public.rooms, $1)).%1$I', key), ', ') into v_set from jsonb_object_keys(v_room_patch) key;
    execute 'update public.rooms set ' || v_set || ', updated_at = clock_timestamp() where id = $2' using v_room_patch, v_room.id;
  end if;
  if v_detail_patch <> '{}'::jsonb then
    if not v_detail_exists then insert into public.room_details(id, room_id) values(gen_random_uuid(), v_room.id); end if;
    select string_agg(format('%1$I = (jsonb_populate_record(null::public.room_details, $1)).%1$I', key), ', ') into v_set from jsonb_object_keys(v_detail_patch) key;
    execute 'update public.room_details set ' || v_set || ' where room_id = $2' using v_detail_patch, v_room.id;
  end if;
  foreach v_key in array array['images', 'videos'] loop
    if not v_key = any(p_selected_fields) then continue; end if;
    v_field := case when v_key = 'images' then 'image' else 'video' end;
    if not exists(select 1 from jsonb_array_elements(p_media) m where m->>'type' = v_field) then raise exception 'EMPTY_MEDIA: Không được xóa album vì thiếu media mới.'; end if;
    delete from public.room_media where room_id = v_room.id and type = v_field;
    insert into public.room_media(room_id, provider, type, url, path, is_cover, sort_order)
      select v_room.id, 'r2', v_field, m->>'url', m->>'path', coalesce((m->>'is_cover')::boolean, false), (m->>'sort_order')::integer
      from jsonb_array_elements(p_media) m where m->>'type' = v_field;
  end loop;
  update public.pending_room_versions set status = 'Đã duyệt', approved_room_id = v_room.id,
    approved_at = now(), approved_by = p_actor_id, auto_approve_enabled = false, auto_approve_at = null,
    auto_approve_actor_id = null, auto_approve_processing_at = null,
    room_payload = jsonb_set(room_payload, '{_room_import,approved_fields}', to_jsonb(p_selected_fields)) where id = p_pending_id;
  update public.zalo_import_batches set status = 'Đã duyệt' where id = v_pending.batch_id;
  return jsonb_build_object('roomId', v_room.id, 'selectedFields', p_selected_fields);
end;
$$;
revoke all on function public.approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb) to service_role;
commit;
