-- Read-only. Replace the reviewed cutoff in both scripts if the scope is recounted.
begin read only;

with settings as (
  select timestamptz '2026-11-08 04:48:50.863612+07' as cutoff
)
select cutoff, cutoff at time zone 'Asia/Ho_Chi_Minh' as cutoff_vietnam,
  count(l.created_at) as candidate_rows,
  coalesce(sum(coalesce(pg_column_size(l.old_data), 0)::bigint + coalesce(pg_column_size(l.new_data), 0)), 0) as stored_json_bytes,
  pg_total_relation_size('public.owner_audit_logs'::regclass) as total_table_bytes
from settings s
left join public.owner_audit_logs l on l.created_at < s.cutoff
-- After applying the migrations, add to the join:
-- and l.expires_at is null and not l.retention_hold
group by cutoff;

commit;
