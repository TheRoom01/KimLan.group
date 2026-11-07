-- psql only. One bounded transaction per call, after rollout and explicit approval.
\set ON_ERROR_STOP on
\if :{?approved_verified_backup}
\else
  \set approved_verified_backup ''
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
select set_config('audit_retention.approved_verified_backup', :'approved_verified_backup', true) as backup_reference
\gset
do $$
begin
  if nullif(btrim(current_setting('audit_retention.approved_verified_backup', true)), '') is null then
    raise exception 'Approval and a verified backup reference are required';
  end if;
  if not pg_try_advisory_xact_lock(72664109534255712) then
    raise exception 'Another cleanup is in progress';
  end if;
end;
$$;

with batch as (
  select id from public.owner_audit_logs
  where created_at < timestamptz '2026-11-08 04:48:50.863612+07'
    and expires_at is null and not retention_hold
  order by created_at, id limit 1000
  for update skip locked
),
removed as (
  delete from public.owner_audit_logs l using batch b where l.id = b.id
  returning l.created_at
)
select count(*) as deleted_rows, min(created_at) as oldest_removed, max(created_at) as newest_removed
from removed;

commit;
