-- Keep original Zalo text separate from counters read by older admin clients.
alter table public.zalo_reader_runs
  add column import_issue_sources jsonb not null default '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.report_zalo_reader_status_v1(p_event jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_group public.zalo_reader_groups%rowtype; v_id text := p_event->>'group_id';
begin
 select * into v_group from public.zalo_reader_groups where group_key=p_event->>'group_key' for update;
 if not found or (v_group.group_id is not null and v_id is not null and v_group.group_id<>v_id) then raise exception 'GROUP_ID_CHANGED'; end if;
 if v_id is not null and v_group.group_id is null then
   update public.zalo_reader_groups set group_id=v_id where group_key=v_group.group_key;
 end if;
 insert into public.zalo_reader_runs(run_id,group_key,group_id,mode,status,started_at,heartbeat_at,finished_at,window_from,window_to,counters,error_code,import_issue_sources)
 values((p_event->>'run_id')::uuid,v_group.group_key,coalesce(v_id,v_group.group_id),p_event->>'mode',p_event->>'status',
 (p_event->>'started_at')::timestamptz,(p_event->>'heartbeat_at')::timestamptz,(p_event->>'finished_at')::timestamptz,(p_event->>'window_from')::timestamptz,(p_event->>'window_to')::timestamptz,p_event->'counters',p_event->>'error_code',coalesce(p_event->'import_issue_sources','{}'::jsonb))
 on conflict(run_id,group_key) do update set group_id=coalesce(excluded.group_id,zalo_reader_runs.group_id),
 heartbeat_at=excluded.heartbeat_at,finished_at=excluded.finished_at,status=excluded.status,counters=excluded.counters,error_code=excluded.error_code,
 import_issue_sources=case when p_event ? 'import_issue_sources' then excluded.import_issue_sources else zalo_reader_runs.import_issue_sources end
 where zalo_reader_runs.status='running' and excluded.heartbeat_at>=zalo_reader_runs.heartbeat_at;
 return true;
end $function$;
