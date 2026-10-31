import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { readerCycleDue } from "../official-runner";
import { OfficialSession, atomicJson } from "../official-runtime";
import { OFFICIAL_ZALO_GROUPS, initializeCheckpoint, commitSource, READER_INTERVAL_MS } from "../../../lib/zalo-reader/official";
import { importLocationQueries, readPendingLocation, applyPendingLocation } from "../../../lib/zalo-import/pending-location";

async function main() {
  assert.deepEqual(importLocationQueries("125/4/30", "Bùi Đình Túy", "Bình Thạnh"), ["Hẻm 125 Bùi Đình Túy, Phường Bình Thạnh", "Bùi Đình Túy, Phường Bình Thạnh"]);
  assert.deepEqual(importLocationQueries("125/4/30", "125/4/30 Bùi Đình Túy", "Phường Bình Thạnh"), ["Hẻm 125 Bùi Đình Túy, Phường Bình Thạnh", "Bùi Đình Túy, Phường Bình Thạnh"]);
  assert.throws(() => readPendingLocation({latitude:91,longitude:106}), /không hợp lệ/);
  let applied = 0;
  const actor = { rpc: async (name: string, args: Record<string, unknown>) => { assert.equal(name, "update_admin_room_property_location_v1"); assert.equal(args.p_room_id, "room"); applied++; return {error:null}; } };
  assert.equal(await applyPendingLocation(actor,"room",{_pending_location:{latitude:10.8,longitude:106.7}}), null); assert.equal(applied,1);
  assert.match((await applyPendingLocation(undefined,"room",{_pending_location:null}))!, /Đã duyệt phòng/);

  const batches = [{id:"b1",source_message_id:"rejected",status:"Từ chối",parser_result:{}}, {id:"b2",source_message_id:"mixed",status:"Chờ duyệt",parser_result:{}}];
  const pending = [{id:"rejected-id",batch_id:"b1",status:"Từ chối"},{id:"kept-id",batch_id:"b2",status:"Chờ duyệt"}];
  const db = { from: (name: string) => { const query = { select:()=>query,eq:()=>query,in:()=>query,then:(resolve: (value: unknown)=>unknown)=>Promise.resolve({data:name==="zalo_import_batches"?batches:pending,error:null}).then(resolve) }; return query; } };
  const deps: Record<string,unknown> = {"next/server":{NextResponse},"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"@/lib/zalo-reader/status-service":{readerSecretMatches:()=>true},"@/lib/zalo-reader/official":{OFFICIAL_ZALO_GROUPS}};
  const loaded = {exports:{} as {POST:(req:Request)=>Promise<Response>}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/api/internal/zalo-reader/receipts/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,require:(name:string)=>{assert.ok(name in deps,name);return deps[name]}});
  const response = await loaded.exports.POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({groupKey:OFFICIAL_ZALO_GROUPS[0].key,sources:[{id:"rejected",pendingIds:["rejected-id"]},{id:"deleted",pendingIds:["deleted-id"]},{id:"mixed",pendingIds:["kept-id","deleted-sibling"]}]})}));
  assert.deepEqual((await response.json()).replay,["deleted","mixed"]);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"zalo-replay-"));
  try {
    const now=Date.now(), key=OFFICIAL_ZALO_GROUPS[0].key;
    const checkpoint=initializeCheckpoint(key,now); checkpoint.processedThroughMs=now-60000;
    commitSource(checkpoint,["deleted"],now-3*READER_INTERVAL_MS,"pending_created"); checkpoint.receipts.deleted.pendingIds=["deleted-id"];
    commitSource(checkpoint,["rejected"],now-2*READER_INTERVAL_MS,"existing_source"); checkpoint.receipts.rejected.pendingIds=["rejected-id"];
    atomicJson(path.join(directory,"checkpoints",`${key}.json`),checkpoint);
    const session=new OfficialSession({stateDirectory:directory,trial:false,initialLookbackHours:24,overlapMinutes:15,maxMessages:10,maxRooms:20,maxScrollSteps:200,now:()=>now,reconcile:async()=>["deleted"]});
    await session.beginGroup({},key,OFFICIAL_ZALO_GROUPS[0].name);
    assert.ok(session.active!.window.fromMs<=now-3*READER_INTERVAL_MS);
    assert.equal("deleted" in session.active!.checkpoint.receipts,false); assert.ok(session.active!.checkpoint.receipts.rejected);
    const selected=session.select([{markerMessageId:"deleted",markerTimestamp:now-3*READER_INTERVAL_MS,sourceHash:"hash"}]);assert.equal(selected.length,1);
    session.accept(selected[0],{ok:true,pendingVersionId:"new-id"});assert.deepEqual(session.active!.checkpoint.receipts.deleted.pendingIds,["new-id"]);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
  const runner=fs.readFileSync("tools/zalo-reader/official-runner.ts","utf8");
  const future = {runId:"previous", nextEligibleAt:new Date(Date.now()+3600000).toISOString()};
  assert.equal(readerCycleDue(false,future),true);
  assert.equal(readerCycleDue(true,future),false);
  assert.equal(readerCycleDue(true,{runId:null,nextEligibleAt:future.nextEligibleAt}),true);
  assert.equal(readerCycleDue(true,future,Date.parse(future.nextEligibleAt)),true);
  assert.match(runner,/if\(cycleAttempted && !trial && args.includes\("--scheduled"\)\)/);
  assert.match(fs.readFileSync("tools/zalo-reader/scheduled-run.ps1","utf8"),/--confirm-production --scheduled/);
  console.log("Manual cooldown bypass / deleted source + sibling replay / rejection retained / widened checkpoint / location queries + validation + property attachment PASS");
}
main().catch(error=>{console.error(error);process.exitCode=1});
