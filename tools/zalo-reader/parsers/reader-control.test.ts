import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import * as controlService from "../../../lib/zalo-reader/control-service";
import { syncReaderControl, launchReaderOnce } from "../control-agent";
import path from "node:path";

async function main() {
  const row: any = { id: "primary", desired_enabled: null, request_id: null, applied_request_id: null };
  let writes = 0;
  class Query {
    patch: any; filters: [string, any][] = [];
    select() { return this; } eq(key: string, value: any) { this.filters.push([key, value]); return this; }
    update(patch: any) { this.patch = patch; return this; }
    result() { if (this.filters.every(([key, value]) => row[key] === value) && this.patch) { Object.assign(row, this.patch); writes++; } return { data: structuredClone(row), error: null }; }
    single() { return Promise.resolve(this.result()); }
    then(resolve: any, reject: any) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  const db = { from: (table: string) => { assert.equal(table, "zalo_reader_control"); return new Query(); } };
  await controlService.requestReaderControl(db, true, "admin"); const first = row.request_id;
  await controlService.requestReaderControl(db, false, "admin"); const latest = row.request_id;
  assert.notEqual(first, latest);
  await controlService.reportReaderControl(db, { requestId: first, actualEnabled: true });
  assert.equal(row.applied_request_id, null, "stale acknowledgment cannot confirm newer Stop");
  await controlService.reportReaderControl(db, { requestId: latest, actualEnabled: false });
  assert.equal(row.applied_request_id, latest);
  assert.equal(row.actual_enabled, false);
  const before = writes;
  await assert.rejects(controlService.reportReaderControl(db, { requestId: latest, actualEnabled: false, error: "secret text" }));
  assert.equal(writes, before);

  let actual = false; const applied: boolean[] = []; const reports: any[] = []; const immediateRuns: string[] = [];
  const command = { request_id: randomUUID(), applied_request_id: null as string | null, desired_enabled: true as boolean | null };
  const deps = { read: async () => command, actual: () => actual, apply: (enabled: boolean) => { applied.push(enabled); actual = enabled; }, runNow: async (id: string) => { immediateRuns.push(id); }, report: async (body: any) => { reports.push(body); } };
  await syncReaderControl(deps); assert.deepEqual(applied, [true]); assert.equal(reports.at(-1).requestId, command.request_id);
  assert.deepEqual(immediateRuns, [command.request_id], "Start requests an immediate production run");
  command.applied_request_id = command.request_id; await syncReaderControl(deps); assert.deepEqual(applied, [true], "acknowledged Start is not replayed");
  command.request_id = randomUUID(); command.desired_enabled = false;
  await syncReaderControl(deps); assert.deepEqual(applied, [true, false]); assert.equal(actual, false);
  assert.equal(immediateRuns.length, 1, "Stop never launches Reader");
  await syncReaderControl({ ...deps, apply: () => { throw new Error("private command output"); } });
  assert.equal(reports.at(-1).error, "SCHEDULER_CONTROL_FAILED"); assert.doesNotMatch(JSON.stringify(reports), /private/);
  const actions = applied.length;
  await assert.rejects(syncReaderControl({ ...deps, read: async () => { throw new Error("offline"); } }));
  assert.equal(applied.length, actions, "unreachable API must not change scheduler");
  const directory = path.resolve(".zalo-reader/offline-control-launch", randomUUID());
  const requestId = randomUUID(); let launches = 0;
  const launch = async () => { launches++; };
  await launchReaderOnce(directory, requestId, launch);
  await launchReaderOnce(directory, requestId, launch);
  assert.equal(launches, 1, "lost ACK cannot replay the same immediate run");
  const failedId = randomUUID();
  await assert.rejects(launchReaderOnce(directory, failedId, async () => { throw new Error("spawn failed"); }));
  await launchReaderOnce(directory, failedId, launch);
  assert.equal(launches, 2, "failed process spawn can be retried");
  await assert.rejects(launchReaderOnce(directory, "../invalid", launch));

  let signedIn = true; let level = 1; let secretOK = true;
  const dependencies: any = {
    "next/server": { NextResponse: { json: (body: any, options: any) => Response.json(body, options) } },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: "admin" } : null } }) }, rpc: async () => ({ data: level }) }) },
    "@/lib/zalo-reader/control-service": controlService,
    "@/lib/zalo-reader/status-service": { readerSecretMatches: () => secretOK },
  };
  const load = (file: string) => {
    const module = { exports: {} as any };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, URL, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
    return module.exports;
  };
  const admin = load("app/api/admin/zalo-reader/control/route.ts");
  const internal = load("app/api/internal/zalo-reader/control/route.ts");
  const request = (body: any, origin = "https://example.test") => new Request("https://example.test/api/admin/zalo-reader/control", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
  signedIn = false; assert.equal((await admin.POST(request({ enabled: true }))).status, 403);
  signedIn = true; level = 0; assert.equal((await admin.POST(request({ enabled: true }))).status, 403);
  level = 2; assert.equal((await admin.POST(request({ enabled: true }, "https://evil.test"))).status, 403);
  assert.equal((await admin.POST(request({ enabled: "true" }))).status, 400);
  assert.equal((await admin.POST(request({ enabled: false }))).status, 200);
  secretOK = false; assert.equal((await internal.GET(request({}))).status, 401);
  secretOK = true; assert.equal((await internal.GET(request({}))).status, 200);
  console.log("Reader control: admin/secret auth, origin, superseded commands, heartbeat, Start/Stop, retry, offline: PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
