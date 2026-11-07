import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { GET, POST } from "../../../app/api/cron/zalo-auto-approve/route.ts";
import { readZaloAutoImportSettings } from "../../../lib/zalo-import/quality.ts";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.OFFLINE_SQL_RUNTIME ||
  path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
const migration = readFileSync("supabase/migrations/20261107192524_disable_zalo_auto_approve.sql", "utf8");

for (const [method, handler] of [["GET", GET], ["POST", POST]]) {
  const response = await handler(new Request("http://offline.test/api/cron/zalo-auto-approve", {
    method, headers: { "x-cron-secret": "fixture", authorization: "Bearer fixture" },
  }));
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { ok: false, code: "ZALO_AUTO_APPROVE_DISABLED" });
}

process.env.ZALO_AUTO_IMPORT_ENABLED = "true";
process.env.ZALO_AUTO_IMPORT_DRY_RUN = "false";
const { enabled, dryRun } = readZaloAutoImportSettings("fixture");
assert.equal(enabled, false);
assert.equal(dryRun, true);

const db = new PGlite();
try {
  await db.exec(migration); // No pg_cron schema on a fresh offline database.
  await db.exec(`
    create schema cron;
    create table cron.job(jobid bigint primary key, jobname text, command text);
    create table cron.job_run_details(jobid bigint, runid bigint);
    create function cron.unschedule(target bigint) returns boolean language plpgsql as $$
      begin
        delete from cron.job where jobid = target;
        return found;
      end;
    $$;
    insert into cron.job values
      (1, 'owner-email-outbox-worker', 'select process_email()'),
      (2, 'purge-owner-trash-daily', 'select public.purge_owner_trash_v1()'),
      (3, 'activate-due-room-availability', 'select activate_rooms()'),
      (42, 'zalo-auto-approve-every-minute', 'select net.http_post(''https://offline.test/api/cron/zalo-auto-approve'')');
    insert into cron.job_run_details values (42, 101), (1, 102);
    create table public.pending_room_versions(id int, status text, auto_approve_enabled boolean);
    insert into public.pending_room_versions values (1, 'Chờ duyệt', true);
  `);
  await db.exec(migration);
  await db.exec(migration);
  const jobs = (await db.query("select jobname from cron.job order by jobid")).rows.map(row => row.jobname);
  assert.deepEqual(jobs, ["owner-email-outbox-worker", "purge-owner-trash-daily", "activate-due-room-availability"]);
  assert.equal((await db.query("select count(*)::int as count from cron.job_run_details")).rows[0].count, 2);
  assert.deepEqual((await db.query("select * from public.pending_room_versions")).rows, [{ id: 1, status: "Chờ duyệt", auto_approve_enabled: true }]);

  await db.exec("insert into cron.job values (43, 'zalo-auto-approve-every-minute', 'select unverified_wrapper()')");
  await assert.rejects(() => db.exec(migration), /Verify the command for Zalo Auto Approve job 43/);
  assert.equal((await db.query("select count(*)::int as count from cron.job")).rows[0].count, 4);
} finally {
  await db.close();
}
console.log("Offline Auto Approve PASS: retired endpoints, legacy flags, scoped/idempotent unschedule, and preserved jobs and history");
