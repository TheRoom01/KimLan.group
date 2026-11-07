import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.OFFLINE_SQL_RUNTIME ||
  path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("daily retention is opt-in, bounded, protected and reported to L1 only", async () => {
  const db = new PGlite();
  const one = async sql => (await db.query(sql)).rows[0];
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema admin_staff_private; create schema cron;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function public.is_admin_l1() returns boolean language sql stable as
        $$select current_setting('test.l1',true) = 'yes'$$;
      create table public.owner_audit_logs(
        id bigint primary key, entity_type text, entity_id uuid, action text,
        actor_id uuid, actor_name text, actor_role text, source text, changed_fields text[],
        old_data jsonb, new_data jsonb, operation_id text, created_at timestamptz not null default now(),
        expires_at timestamptz, retention_hold boolean not null default false
      );
      create table public.visitor_events(like public.owner_audit_logs including defaults);
      create table admin_staff_private.account_events(like public.owner_audit_logs including defaults);
      create table public.zalo_reader_runs(
        run_id uuid, group_key text, started_at timestamptz not null, finished_at timestamptz,
        status text not null, primary key (run_id,group_key)
      );
      create table public.zalo_import_batches(id uuid primary key, parser_result jsonb);
      create table public.pending_room_versions(batch_id uuid, status text);
      create table public.room_audit_events(id int primary key);
      create table public.room_lifecycle_audit(id int primary key);
      create table cron.job_run_details(runid bigint primary key, status text, end_time timestamptz);
      create table cron.job(name text primary key, schedule text, command text, active boolean not null default true);
      create function cron.schedule_in_database(
        job_name text, schedule text, command text, database text,
        username text default null, active boolean default true
      ) returns bigint language sql as
        $$insert into cron.job values($1,$2,$3,$6) returning 1::bigint$$;
      insert into cron.job values('owner-email-outbox-worker','* * * * *','worker'),
        ('purge-owner-trash-daily','0 1 * * *','purge'), ('activate-due-room-availability','0 0 * * *','activate');
      insert into public.room_audit_events values(1);
      insert into public.room_lifecycle_audit values(1);
    `);
    await db.exec(read("supabase/migrations/20261107220110_schedule_audit_retention.sql"));
    await db.exec(`
      insert into public.owner_audit_logs(id,expires_at) select n, now() - interval '1 hour' from generate_series(1,1001) n;
      insert into public.owner_audit_logs(id,created_at,expires_at,retention_hold) values
        (1002,'2026-11-07 21:48:49+00',null,false),
        (1003,'2026-11-07 21:48:49+00',null,true),
        (1004,'2026-11-07 21:48:50.863612+00',null,false),
        (1005,now(),now()-interval '1 hour',true),
        (1006,now(),now()+interval '1 hour',false);
      insert into public.visitor_events(id,expires_at) values (1,now()-interval '1 day');
      insert into admin_staff_private.account_events(id,expires_at,retention_hold) values (1,now()-interval '1 day',true);
      insert into public.zalo_reader_runs
      select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'group',
        now() - make_interval(days=>100-n), now() - interval '90 days',
        case when n=4 then 'running' else 'idle' end from generate_series(1,5) n;
      insert into public.zalo_import_batches values
        ('00000000-0000-0000-0000-000000000011','{"official_source":{"run_id":"00000000-0000-0000-0000-000000000002"}}'),
        ('00000000-0000-0000-0000-000000000012','{"official_source":{"run_id":"00000000-0000-0000-0000-000000000001"}}');
      insert into public.pending_room_versions values
        ('00000000-0000-0000-0000-000000000011','Chờ duyệt'),
        ('00000000-0000-0000-0000-000000000012','Đã duyệt');
      update public.zalo_reader_runs set retention_hold=true where run_id='00000000-0000-0000-0000-000000000003';
      insert into cron.job_run_details values
        (1,'succeeded',now()-interval '8 days'), (2,'succeeded',now()-interval '6 days'),
        (3,'failed',now()-interval '31 days'), (4,'failed',now()-interval '29 days'),
        (5,'running',now()-interval '40 days'), (6,'succeeded',null), (7,'failed',now()-interval '31 days');
      insert into audit_retention_private.cron_run_holds values(7);
      select audit_retention_private.cleanup_daily();
    `);
    assert.deepEqual(await one("select count(*)::int n from public.owner_audit_logs"), { n: 1006 });
    assert.deepEqual(await one("select enabled,last_run_at from audit_retention_private.state"), { enabled: false, last_run_at: null });
    assert.deepEqual(await one("select count(*)::int n from cron.job"), { n: 4 });
    assert.deepEqual(await one("select schedule,active from cron.job where name='the-room-audit-retention-daily'"), {
      schedule: "17 20 * * *", active: false,
    });
    assert.equal((await one("select count(*)::int n from cron.job where active")).n, 3);
    await db.exec("delete from audit_retention_private.state; select audit_retention_private.cleanup_daily();");
    assert.deepEqual(await one("select count(*)::int n from public.owner_audit_logs"), { n: 1006 });
    await db.exec("insert into audit_retention_private.state default values");
    await db.exec("update audit_retention_private.state set enabled=true; select audit_retention_private.cleanup_daily();");
    const last = await one("select last_deleted,last_errors from audit_retention_private.state");
    assert.deepEqual(last.last_deleted, { owner_audit: 1000, customer_activity: 1, staff_audit: 0, zalo_reader: 1, cron_runs: 2 });
    assert.deepEqual(last.last_errors, {});
    assert.deepEqual(await one("select array_agg(runid::int order by runid) as runs from cron.job_run_details"), { runs: [2,4,5,6,7] });
    assert.equal((await one("select count(*)::int n from public.room_audit_events")).n, 1);
    assert.equal((await one("select count(*)::int n from public.room_lifecycle_audit")).n, 1);
    assert.equal((await one("select count(*)::int n from public.pending_room_versions")).n, 2);
    assert.equal((await one("select count(*)::int n from public.owner_audit_logs where expires_at is null")).n, 3);

    await db.exec("set role anon");
    await assert.rejects(one("select public.get_audit_retention_status_v1()"), /permission denied/);
    await db.exec("reset role; set role authenticated; set test.uid='00000000-0000-0000-0000-000000000001'; set test.l1='no'");
    await assert.rejects(one("select public.get_audit_retention_status_v1()"), /FORBIDDEN/);
    await assert.rejects(one("select public.get_recent_operational_audit_v1()"), /FORBIDDEN/);
    await db.exec("set test.l1='yes'");
    const { status } = await one("select public.get_audit_retention_status_v1() as status");
    assert.equal(status.sources.owner_audit.expired, 1);
    assert.equal(status.sources.owner_audit.remaining, 6);
    assert.equal(status.sources.owner_audit.held, 2);
    assert.equal(status.sources.owner_audit.without_expiry, 3);
    assert.equal(status.sources.zalo_reader.expired, 0);
    assert.equal(status.sources.cron_runs.held, 1);
    assert.equal((await one("select public.get_recent_operational_audit_v1() as events")).events.length, 3);
    await db.exec(`
      reset role;
      create function cron.refuse_delete() returns trigger language plpgsql as
        $$begin raise exception 'fixture failure'; end$$;
      create trigger fixture_delete_failure before delete on cron.job_run_details
        for each row execute function cron.refuse_delete();
      insert into cron.job_run_details values (8,'succeeded',now()-interval '8 days');
      select audit_retention_private.cleanup_daily();
    `);
    const failed = await one("select last_deleted,last_errors from audit_retention_private.state");
    assert.equal(failed.last_deleted.owner_audit, 1);
    assert.deepEqual(failed.last_errors, { cron_runs: "P0001" });
    assert.equal((await one("select count(*)::int n from cron.job_run_details where runid=8")).n, 1);

    const dryRun = read("supabase/sql/audit-retention-legacy-dry-run.sql");
    const [candidate] = (await db.exec(dryRun)).find(result => result.rows.length).rows;
    assert.equal(Number(candidate.candidate_rows), 2);
    const deleteScript = read("supabase/sql/audit-retention-legacy-delete-batch.sql");
    const approvedBatch = deleteScript.slice(deleteScript.indexOf("with batch as"), deleteScript.lastIndexOf("commit;"));
    assert.equal(Number((await one(approvedBatch)).deleted_rows), 1);
    assert.deepEqual(await one("select array_agg(id::int order by id) as ids from public.owner_audit_logs where expires_at is null"), { ids: [1003,1004] });
  } finally {
    await db.close();
  }
});
