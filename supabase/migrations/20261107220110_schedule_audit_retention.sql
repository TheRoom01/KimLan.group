begin;

create schema if not exists audit_retention_private;
revoke all on schema audit_retention_private from public, anon, authenticated, service_role;

create table audit_retention_private.state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_deleted jsonb not null default '{}',
  last_errors jsonb not null default '{}'
);
insert into audit_retention_private.state default values;

create table audit_retention_private.cron_run_holds (runid bigint primary key);

alter table public.zalo_reader_runs
  add column retention_hold boolean not null default false;
create index zalo_reader_runs_retention_idx
  on public.zalo_reader_runs (finished_at)
  where finished_at is not null and status <> 'running' and not retention_hold;
create index owner_audit_logs_recent_operational_idx
  on public.owner_audit_logs (created_at desc, id desc) where expires_at is not null;

-- Source keys are closed over this fixed list. The functions are not exposed by PostgREST.
create function audit_retention_private.expiring_tables()
returns table (source text, relation regclass)
language sql stable set search_path = ''
as $$
  values
    ('owner_audit', 'public.owner_audit_logs'::regclass),
    ('customer_activity', 'public.visitor_events'::regclass),
    ('staff_audit', 'admin_staff_private.account_events'::regclass);
$$;

create function audit_retention_private.reader_protected(p_run_id uuid, p_group_key text)
returns boolean
language sql stable set search_path = ''
as $$
  select p_run_id = (
    select r.run_id from public.zalo_reader_runs r
    where r.group_key = p_group_key
    order by r.started_at desc, r.run_id desc limit 1
  ) or exists (
    select 1 from public.zalo_import_batches b
    join public.pending_room_versions p on p.batch_id = b.id
    where b.parser_result->'official_source'->>'run_id' = p_run_id::text
      and (p.status is null or p.status not in ('Đã duyệt', 'Từ chối', 'Hết hạn'))
  );
$$;

-- pg_cron runs this as the migration's scheduler role. Each source has its own
-- exception scope, so a failing source cannot lose its rows or block other sources.
create function audit_retention_private.cleanup_daily()
returns void
language plpgsql set search_path = '' set lock_timeout = '3s'
as $$
declare
  target record;
  cutoff timestamptz := statement_timestamp();
  deleted jsonb := '{}';
  errors jsonb := '{}';
  affected bigint;
begin
  if not pg_try_advisory_xact_lock(72664109534255712)
    or not coalesce((select enabled from audit_retention_private.state where singleton), false) then
    return;
  end if;

  for target in select * from audit_retention_private.expiring_tables() loop
    begin
      execute format(
        'with batch as (
           select ctid from %1$s where expires_at <= $1 and not retention_hold
           order by expires_at limit 1000 for update skip locked
         )
         delete from %1$s t using batch b where t.ctid = b.ctid', target.relation
      ) using cutoff;
      get diagnostics affected = row_count;
      deleted := deleted || jsonb_build_object(target.source, affected);
    exception when others then
      errors := errors || jsonb_build_object(target.source, sqlstate);
    end;
  end loop;

  begin
    with batch as (
      select r.run_id, r.group_key
      from public.zalo_reader_runs r
      where r.finished_at <= cutoff - interval '1440 hours'
        and r.status <> 'running' and not r.retention_hold
        and not audit_retention_private.reader_protected(r.run_id, r.group_key)
      order by r.finished_at limit 1000 for update of r skip locked
    )
    delete from public.zalo_reader_runs r using batch b
    where (r.run_id, r.group_key) = (b.run_id, b.group_key);
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('zalo_reader', affected);
  exception when others then
    errors := errors || jsonb_build_object('zalo_reader', sqlstate);
  end;

  begin
    with batch as (
      select c.runid from cron.job_run_details c
      where (
        (c.status = 'succeeded' and c.end_time <= cutoff - interval '168 hours')
        or (c.status = 'failed' and c.end_time <= cutoff - interval '720 hours')
      ) and not exists (select 1 from audit_retention_private.cron_run_holds h where h.runid = c.runid)
      order by c.end_time, c.runid limit 1000 for update of c skip locked
    )
    delete from cron.job_run_details c using batch b where c.runid = b.runid;
    get diagnostics affected = row_count;
    deleted := deleted || jsonb_build_object('cron_runs', affected);
  exception when others then
    errors := errors || jsonb_build_object('cron_runs', sqlstate);
  end;

  update audit_retention_private.state set
    last_run_at = cutoff, last_deleted = deleted, last_errors = errors
  where singleton;
end;
$$;

revoke all on all tables in schema audit_retention_private from public, anon, authenticated, service_role;
revoke execute on all functions in schema audit_retention_private from public, anon, authenticated, service_role;

create function public.get_audit_retention_status_v1()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target record;
  cutoff timestamptz := statement_timestamp();
  counts jsonb := '{}';
  summary jsonb;
  result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin_l1(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for target in select * from audit_retention_private.expiring_tables() loop
    execute format(
      'select jsonb_build_object(''remaining'', count(*),
         ''expired'', count(*) filter (where expires_at <= $1 and not retention_hold),
         ''held'', count(*) filter (where retention_hold),
         ''without_expiry'', count(*) filter (where expires_at is null),
         ''bytes'', pg_total_relation_size($2)) from %s', target.relation
    ) into summary using cutoff, target.relation;
    counts := counts || jsonb_build_object(target.source, summary);
  end loop;

  select jsonb_build_object('remaining', count(*),
    'expired', count(*) filter (where r.finished_at <= cutoff - interval '1440 hours'
      and r.status <> 'running' and not r.retention_hold
      and not audit_retention_private.reader_protected(r.run_id, r.group_key)),
    'held', count(*) filter (where r.retention_hold),
    'bytes', pg_total_relation_size('public.zalo_reader_runs'::regclass))
  into summary from public.zalo_reader_runs r;
  counts := counts || jsonb_build_object('zalo_reader', summary);

  select jsonb_build_object('remaining', count(*),
    'expired', count(*) filter (where not held and (
      (c.status = 'succeeded' and c.end_time <= cutoff - interval '168 hours')
      or (c.status = 'failed' and c.end_time <= cutoff - interval '720 hours'))),
    'held', count(*) filter (where held),
    'bytes', pg_total_relation_size('cron.job_run_details'::regclass))
  into summary from cron.job_run_details c
  cross join lateral (select exists (
    select 1 from audit_retention_private.cron_run_holds h where h.runid = c.runid
  ) as held) hold_status;
  counts := counts || jsonb_build_object('cron_runs', summary);

  select jsonb_build_object('enabled', s.enabled, 'last_run_at', s.last_run_at,
    'last_deleted', s.last_deleted, 'last_errors', s.last_errors, 'sources', counts)
  into result from audit_retention_private.state s where s.singleton;
  return result;
end;
$$;

revoke execute on function public.get_audit_retention_status_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_audit_retention_status_v1() to authenticated;

create function public.get_recent_operational_audit_v1()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_admin_l1(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(event) order by event.created_at desc, event.id desc)
    from (
      select id, entity_type, entity_id, action, actor_id, actor_name, actor_role, source,
        changed_fields, old_data, new_data, operation_id, created_at, expires_at
      from public.owner_audit_logs
      where expires_at is not null
      order by created_at desc, id desc limit 25
    ) event
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_recent_operational_audit_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_recent_operational_audit_v1() to authenticated;

-- Supabase pg_cron uses UTC on the shared project. 20:17 UTC = 03:17 in Vietnam.
-- Register the job inactive. The cleanup flag also remains false.
select cron.schedule_in_database(
  'the-room-audit-retention-daily',
  '17 20 * * *',
  'select audit_retention_private.cleanup_daily()',
  current_database(),
  active := false
);

commit;
