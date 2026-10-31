-- Deploy manually AFTER review. Not executed by the offline setup.
-- Requires existing Imports tables and zalo-import-room-updates.sql.
begin;
create table if not exists public.zalo_reader_groups (
  group_key text primary key, group_name text not null unique, group_id text unique,
  scheduler_enabled boolean not null default false, next_expected_at timestamptz,
  check (group_key in ('Gio-Hang-Can-Ho-Q1-Q3-Q10','Gio-Hang-Can-Ho-PN-BT-TB'))
);
insert into public.zalo_reader_groups(group_key,group_name,group_id) values
 ('Gio-Hang-Can-Ho-Q1-Q3-Q10','Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠','g1986619726266954037'),
 ('Gio-Hang-Can-Ho-PN-BT-TB','Giỏ Hàng Căn Hộ PN,BT,TB 🏠',null)
on conflict (group_key) do nothing;
create table if not exists public.zalo_reader_runs (
  run_id uuid not null, group_key text not null references public.zalo_reader_groups,
  group_id text, mode text not null check(mode in ('trial','official')),
  status text not null check(status in ('running','idle','error','login_required','needs_review')),
  started_at timestamptz not null, heartbeat_at timestamptz not null, finished_at timestamptz,
  window_from timestamptz, window_to timestamptz,
  counters jsonb not null default '{}', error_code text,
  primary key(run_id,group_key)
);
create index if not exists zalo_reader_runs_recent on public.zalo_reader_runs(group_key,started_at desc);
alter table public.zalo_reader_groups enable row level security;
alter table public.zalo_reader_runs enable row level security;
revoke all on public.zalo_reader_groups,public.zalo_reader_runs from public,anon,authenticated;
grant all on public.zalo_reader_groups,public.zalo_reader_runs to service_role;

create or replace function public.report_zalo_reader_status_v1(p_event jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_group public.zalo_reader_groups%rowtype; v_id text := p_event->>'group_id';
begin
 select * into v_group from public.zalo_reader_groups where group_key=p_event->>'group_key' for update;
 if not found or (v_group.group_id is not null and v_id is not null and v_group.group_id<>v_id) then raise exception 'GROUP_ID_CHANGED'; end if;
 if v_id is not null and v_group.group_id is null then
   update public.zalo_reader_groups set group_id=v_id where group_key=v_group.group_key;
 end if;
 insert into public.zalo_reader_runs(run_id,group_key,group_id,mode,status,started_at,heartbeat_at,finished_at,window_from,window_to,counters,error_code)
 values((p_event->>'run_id')::uuid,v_group.group_key,coalesce(v_id,v_group.group_id),p_event->>'mode',p_event->>'status',
 (p_event->>'started_at')::timestamptz,(p_event->>'heartbeat_at')::timestamptz,(p_event->>'finished_at')::timestamptz,(p_event->>'window_from')::timestamptz,(p_event->>'window_to')::timestamptz,p_event->'counters',p_event->>'error_code')
 on conflict(run_id,group_key) do update set group_id=coalesce(excluded.group_id,zalo_reader_runs.group_id),
 heartbeat_at=excluded.heartbeat_at,finished_at=excluded.finished_at,status=excluded.status,counters=excluded.counters,error_code=excluded.error_code
 where zalo_reader_runs.status='running' and excluded.heartbeat_at>=zalo_reader_runs.heartbeat_at;
 return true;
end $$;
revoke all on function public.report_zalo_reader_status_v1(jsonb) from public,anon,authenticated;
grant execute on function public.report_zalo_reader_status_v1(jsonb) to service_role;

create or replace function public.finalize_zalo_official_source_v1(
 p_batch jsonb,p_pending jsonb,p_images jsonb,p_videos jsonb,p_run_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_meta jsonb := p_batch->'parser_result'->'official_source';
 v_run public.zalo_reader_runs%rowtype; v_existing uuid; v_id uuid := (p_pending->>'id')::uuid;
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
 select id into v_existing from public.pending_room_versions where batch_id=(p_batch->>'id')::uuid;
 if found then return jsonb_build_object('pending_id',v_existing,'created',false); end if;
 if exists(select 1 from public.zalo_import_batches where id=(p_batch->>'id')::uuid or source_hash=p_batch->>'source_hash') then
   raise exception 'INCOMPLETE_SOURCE_REQUIRES_REVIEW';
 end if;
 if v_trial and (select count(*) from public.zalo_import_batches where parser_result->'official_source'->>'run_id'=p_run_id::text)>=10 then
   raise exception 'TRIAL_ROOM_LIMIT';
 end if;
 -- Explicit column lists retain existing table defaults (IDs/timestamps/media flags).
 insert into public.zalo_import_batches(id,group_name,sender_name,source_message_id,source_hash,raw_text,sent_at,status,parser_version,parser_result)
 values((p_batch->>'id')::uuid,p_batch->>'group_name',p_batch->>'sender_name',p_batch->>'source_message_id',p_batch->>'source_hash',p_batch->>'raw_text',
 (p_batch->>'sent_at')::timestamptz,'Chờ duyệt',p_batch->>'parser_version',p_batch->'parser_result');
 insert into public.pending_room_versions(id,batch_id,status,confidence_score,room_payload,detail_payload,source_field_map,inherited_field_map,
 matched_room_id,matched_reason,old_status,new_status,auto_approve_enabled,auto_approve_at,auto_approve_actor_id)
 values(v_id,(p_batch->>'id')::uuid,'Chờ duyệt',(p_pending->>'confidence_score')::numeric,p_pending->'room_payload',p_pending->'detail_payload',
 p_pending->'source_field_map',p_pending->'inherited_field_map',(p_pending->>'matched_room_id')::uuid,p_pending->>'matched_reason',p_pending->>'old_status',p_pending->>'new_status',false,null,null);
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
 return jsonb_build_object('pending_id',v_id,'created',true);
end $$;
revoke all on function public.finalize_zalo_official_source_v1(jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.finalize_zalo_official_source_v1(jsonb,jsonb,jsonb,jsonb,uuid) to service_role;

create or replace function public.zalo_reader_readiness_v1() returns boolean
language sql security invoker set search_path=public,pg_temp as $$
 select to_regprocedure('public.finalize_zalo_official_source_v1(jsonb,jsonb,jsonb,jsonb,uuid)') is not null
 and to_regprocedure('public.report_zalo_reader_status_v1(jsonb)') is not null
 and to_regprocedure('public.approve_zalo_room_update_v1(uuid,uuid,text[],jsonb,jsonb,jsonb)') is not null
 and to_regclass('public.pending_zalo_room_identity_active_uq') is not null
 and (select count(*)=2 from public.zalo_reader_groups);
$$;
revoke all on function public.zalo_reader_readiness_v1() from public,anon,authenticated;
grant execute on function public.zalo_reader_readiness_v1() to service_role;
commit;
