create table public.zalo_deleted_import_sources (
  pending_id uuid primary key,
  source_hash text not null,
  group_name text not null,
  source_message_id text,
  source_room jsonb,
  is_test boolean not null
);
create index zalo_deleted_import_sources_hash_idx on public.zalo_deleted_import_sources (source_hash);
create index zalo_deleted_import_sources_message_idx on public.zalo_deleted_import_sources (group_name, source_message_id);
alter table public.zalo_deleted_import_sources enable row level security;
revoke all on public.zalo_deleted_import_sources from public, anon, authenticated;
grant select, insert on public.zalo_deleted_import_sources to service_role;

create function public.remember_deleted_zalo_import_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.zalo_deleted_import_sources
    (pending_id, source_hash, group_name, source_message_id, source_room, is_test)
  select old.id, b.source_hash, b.group_name, b.source_message_id,
    jsonb_build_object(
      'house_number', coalesce(b.parser_result->'room_payload', old.room_payload)->'house_number',
      'address', coalesce(b.parser_result->'room_payload', old.room_payload)->'address',
      'district', coalesce(b.parser_result->'room_payload', old.room_payload)->'district',
      'room_code', coalesce(b.parser_result->'room_payload', old.room_payload)->'room_code'
    ),
    coalesce(b.parser_result->>'test_import', 'false') = 'true'
      or coalesce(b.parser_result->'official_source'->>'trial', 'false') = 'true'
      or coalesce(old.room_payload->>'is_test_import', 'false') = 'true'
  from public.zalo_import_batches b
  where b.id = old.batch_id and b.source_hash is not null and b.group_name is not null
  on conflict (pending_id) do nothing;
  return old;
end;
$$;
revoke all on function public.remember_deleted_zalo_import_source() from public, anon, authenticated;
grant execute on function public.remember_deleted_zalo_import_source() to service_role;
create trigger remember_deleted_zalo_import_source
before delete on public.pending_room_versions
for each row execute function public.remember_deleted_zalo_import_source();

CREATE OR REPLACE FUNCTION public.finalize_zalo_official_source_v1(p_batch jsonb, p_pending jsonb, p_images jsonb, p_videos jsonb, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_meta jsonb := p_batch->'parser_result'->'official_source';
 v_run public.zalo_reader_runs%rowtype; v_existing public.pending_room_versions%rowtype; v_deleted_id uuid;
 v_replaced_media_keys jsonb := '[]'::jsonb; v_id uuid := (p_pending->>'id')::uuid;
 v_trial boolean := coalesce((v_meta->>'trial')::boolean,false); v_row jsonb;
begin
 -- Serialize both retry identity and the global trial budget across the two groups.
 perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_batch->>'source_hash',1));
 select * into v_run from public.zalo_reader_runs where run_id=p_run_id and group_key=v_meta->>'group_key' for update;
 if not found or v_run.status<>'running' or v_run.group_id is distinct from v_meta->>'group_id'
   or v_run.mode is distinct from (case when v_trial then 'trial' else 'official' end)
   or v_meta->>'run_id' is distinct from p_run_id::text
   or coalesce(v_meta->>'verified','false')<>'true'
   or v_run.window_from is null or v_run.window_to is null
   or (p_batch->>'sent_at')::timestamptz not between v_run.window_from and v_run.window_to
   or not exists(select 1 from public.zalo_reader_groups g where g.group_key=v_run.group_key and g.group_id=v_run.group_id and g.group_name=p_batch->>'group_name')
 then raise exception 'OFFICIAL_RUN_UNVERIFIED'; end if;
 if p_batch->>'source_message_id' is distinct from v_meta->>'source_message_id'
   or p_pending->>'batch_id' is distinct from p_batch->>'id'
   or p_pending->>'status'<>'Chờ duyệt'
   or coalesce(p_pending->>'auto_approve_enabled','true')<>'false'
   or p_pending->>'auto_approve_at' is not null
   or coalesce(p_pending->'room_payload'->>'is_test_import','false') is distinct from v_trial::text
 then raise exception 'OFFICIAL_PAYLOAD_INVALID'; end if;
 select * into v_existing from public.pending_room_versions where batch_id=(p_batch->>'id')::uuid for update;
 select pending_id into v_deleted_id from public.zalo_deleted_import_sources
 where source_hash=p_batch->>'source_hash' limit 1;
 if v_deleted_id is not null then
   return jsonb_build_object('pending_id',v_deleted_id,'created',false,'deleted',true);
 end if;
 if v_existing.id is not null and v_existing.status is distinct from 'Từ chối' then
   return jsonb_build_object('pending_id',v_existing.id,'created',false);
 end if;
 if v_existing.id is not null and (v_existing.id<>v_id or not exists(
   select 1 from public.zalo_import_batches where id=v_existing.batch_id and source_hash=p_batch->>'source_hash'
 )) then raise exception 'OFFICIAL_PAYLOAD_INVALID'; end if;
 if v_existing.id is null and exists(select 1 from public.zalo_import_batches where id=(p_batch->>'id')::uuid or source_hash=p_batch->>'source_hash') then
   raise exception 'INCOMPLETE_SOURCE_REQUIRES_REVIEW';
 end if;
 if v_trial and (select count(*) from public.zalo_import_batches where parser_result->'official_source'->>'run_id'=p_run_id::text)>=10 then
   raise exception 'TRIAL_ROOM_LIMIT';
 end if;
 if v_existing.id is not null then
   with old_images as (
     delete from public.zalo_import_images where batch_id=v_existing.batch_id returning temp_r2_key
   ), old_videos as (
     delete from public.zalo_import_videos where batch_id=v_existing.batch_id returning temp_r2_key,temp_thumb_r2_key
   )
   select coalesce(jsonb_agg(key), '[]'::jsonb) into v_replaced_media_keys from (
     select temp_r2_key as key from old_images
     union select temp_r2_key from old_videos
     union select temp_thumb_r2_key from old_videos
   ) keys where key is not null;
 end if;
 -- Explicit column lists retain existing table defaults (IDs/timestamps/media flags).
 insert into public.zalo_import_batches(id,group_name,sender_name,source_message_id,source_hash,raw_text,sent_at,status,parser_version,parser_result)
 values((p_batch->>'id')::uuid,p_batch->>'group_name',p_batch->>'sender_name',p_batch->>'source_message_id',p_batch->>'source_hash',p_batch->>'raw_text',
 (p_batch->>'sent_at')::timestamptz,'Chờ duyệt',p_batch->>'parser_version',p_batch->'parser_result')
 on conflict (id) do update set status=excluded.status, parser_version=excluded.parser_version,
   parser_result=excluded.parser_result, raw_text=excluded.raw_text, sender_name=excluded.sender_name
 where zalo_import_batches.source_hash=excluded.source_hash;
 if not found then raise exception 'OFFICIAL_PAYLOAD_INVALID'; end if;
 insert into public.pending_room_versions(id,batch_id,status,confidence_score,room_payload,detail_payload,source_field_map,inherited_field_map,
 matched_room_id,matched_reason,old_status,new_status,auto_approve_enabled,auto_approve_at,auto_approve_actor_id)
 values(v_id,(p_batch->>'id')::uuid,'Chờ duyệt',(p_pending->>'confidence_score')::numeric,p_pending->'room_payload',p_pending->'detail_payload',
 p_pending->'source_field_map',p_pending->'inherited_field_map',(p_pending->>'matched_room_id')::uuid,p_pending->>'matched_reason',p_pending->>'old_status',p_pending->>'new_status',false,null,null)
 on conflict (id) do update set status=excluded.status, confidence_score=excluded.confidence_score,
   room_payload=excluded.room_payload, detail_payload=excluded.detail_payload,
   source_field_map=excluded.source_field_map, inherited_field_map=excluded.inherited_field_map,
   matched_room_id=excluded.matched_room_id, matched_reason=excluded.matched_reason,
   old_status=excluded.old_status, new_status=excluded.new_status, auto_approve_enabled=false,
   auto_approve_at=null, auto_approve_actor_id=null, rejected_at=null, rejected_by=null,
   reject_reason=null, created_at=now()
 where pending_room_versions.batch_id=excluded.batch_id and pending_room_versions.status='Từ chối';
 if not found then raise exception 'OFFICIAL_PAYLOAD_INVALID'; end if;
 for v_row in select value from jsonb_array_elements(p_images) loop
   if v_row->>'batch_id' is distinct from p_batch->>'id' then raise exception 'MEDIA_BATCH_MISMATCH'; end if;
   insert into public.zalo_import_images(batch_id,temp_r2_key,temp_image_url,original_name,mime_type,size_bytes,selected,sort_order)
   values((v_row->>'batch_id')::uuid,v_row->>'temp_r2_key',v_row->>'temp_image_url',v_row->>'original_name',v_row->>'mime_type',(v_row->>'size_bytes')::bigint,true,(v_row->>'sort_order')::int);
 end loop;
 for v_row in select value from jsonb_array_elements(p_videos) loop
   if v_row->>'batch_id' is distinct from p_batch->>'id' then raise exception 'MEDIA_BATCH_MISMATCH'; end if;
   insert into public.zalo_import_videos(batch_id,temp_r2_key,temp_video_url,temp_thumb_r2_key,temp_thumb_url,source_url,source_thumb_url,mime_type,size_bytes,duration_ms,width,height,selected,sort_order)
   values((v_row->>'batch_id')::uuid,v_row->>'temp_r2_key',v_row->>'temp_video_url',v_row->>'temp_thumb_r2_key',v_row->>'temp_thumb_url',v_row->>'source_url',v_row->>'source_thumb_url',v_row->>'mime_type',
   (v_row->>'size_bytes')::bigint,(v_row->>'duration_ms')::bigint,(v_row->>'width')::int,(v_row->>'height')::int,true,(v_row->>'sort_order')::int);
 end loop;
 return jsonb_build_object('pending_id',v_id,'created',true,'replaced_media_keys',v_replaced_media_keys);
end $function$;
