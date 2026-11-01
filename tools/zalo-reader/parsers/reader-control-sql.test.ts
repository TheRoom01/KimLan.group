import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const { PGlite } = createRequire(path.resolve("package.json"))(path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
async function main() {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    const sql = fs.readFileSync("supabase/sql/zalo-reader-control.sql", "utf8");
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query("select desired_enabled from zalo_reader_control")).rows[0].desired_enabled, null, "setup does not enable Reader");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from zalo_reader_control"));
      await assert.rejects(db.query("update zalo_reader_control set desired_enabled=true"));
      await db.exec("reset role");
    }
    // service_role bypasses RLS on Supabase; grant must still exist explicitly.
    assert.equal((await db.query("select has_table_privilege('service_role','zalo_reader_control','UPDATE') allowed")).rows[0].allowed, true);
    assert.equal((await db.query("select relrowsecurity from pg_class where relname='zalo_reader_control'")).rows[0].relrowsecurity, true);
    console.log("Reader control SQL: idempotent, RLS, no public access, no implicit Start: PASS (offline)");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
