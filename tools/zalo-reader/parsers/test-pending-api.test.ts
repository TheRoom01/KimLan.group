import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as officialRequest from "../../../lib/zalo-reader/official-request";
import { OFFICIAL_ZALO_GROUPS } from "../../../lib/zalo-reader/official";
import { normalizedRoomIdentity } from "../../../lib/zalo-import/room-comparison";
import { parseZaloRoomText } from "../../../lib/zalo-import/parser";
import { resolveZaloImportRoom } from "../../../lib/zalo-import/resolve";
import { findImportBaseline, assessIncomingChange } from "../../../lib/zalo-import/incoming-change";
import { CONTROLLED_ZALO_GROUP_ID, CONTROLLED_ZALO_GROUP_NAME, isControlledZaloTarget, shouldAutoPublishZaloImport, makeTestPendingIdentity } from "../../../lib/zalo-reader/controlled-staging";

// Execute the real handler with in-memory DB/Storage substitutes: no network or credentials.
async function main() {
  const tables: Record<string, Array<Record<string, any>>> = {
    zalo_import_batches: [], pending_room_versions: [], zalo_import_images: [], zalo_import_videos: [],
    rooms: [], room_details: [], room_media: [], zalo_reader_runs: [],
  };
  let uploads = 0;
  let officialRequestActive = false, officialRpcCalls = 0;
  class Query {
    operation = "select";
    payload: any;
    filters: Array<(row: any) => boolean> = [];
    constructor(readonly table: string) {
      assert.ok(table in tables, `must never access main-room table ${table}`);
    }
    select() { return this; }
    order() { return this; }
    ilike() { return this; }
    range(start: number, end: number) { const result = this.execute(); return Promise.resolve({ ...result, data: result.data.slice(start, end + 1) }); }
    eq(key: string, value: any) {
      this.filters.push((row) => key.includes("->>")
        ? String(row[key.split("->>")[0]]?.[key.split("->>")[1]]) === String(value)
        : row[key] === value);
      return this;
    }
    in(key: string, values: any[]) { this.filters.push((row) => values.includes(row[key])); return this; }
    assertDraftWrite() {
      assert.ok(!officialRequestActive,"official DB writes must go through the atomic finalizer ONLY");
      assert.ok(!["rooms", "room_details", "room_media"].includes(this.table), "test must never WRITE main rooms");
    }
    insert(payload: any) { this.assertDraftWrite(); this.operation = "insert"; this.payload = payload; return this; }
    update(payload: any) { this.assertDraftWrite(); this.operation = "update"; this.payload = payload; return this; }
    delete() { this.assertDraftWrite(); this.operation = "delete"; return this; }
    execute(single = false): any {
      let rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === "insert") {
        rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row: any) => ({ id: crypto.randomUUID(), ...structuredClone(row) }));
        if (rows.some((row) => tables[this.table].some((old) => old.id === row.id))) return { data: null, error: { code: "23505", message: "duplicate primary key" } };
        tables[this.table].push(...rows);
      }
      if (this.operation === "update") rows.forEach((row) => Object.assign(row, structuredClone(this.payload)));
      if (this.operation === "delete") tables[this.table] = tables[this.table].filter((row) => !rows.includes(row));
      return { data: structuredClone(single ? rows[0] || null : rows), error: null };
    }
    single() { return Promise.resolve(this.execute(true)); }
    maybeSingle() { return Promise.resolve(this.execute(true)); }
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }
  const source = fs.readFileSync(path.resolve(__dirname, "../../../lib/zalo-reader/import-service.ts"), "utf8");
  const module = { exports: {} as { POST: (req: Request) => Promise<Response> } };
  const dependencies: Record<string, unknown> = {
    "./official-request": officialRequest,
    crypto,
    "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ from: (table: string) => new Query(table),
      rpc: async (name: string,args: any) => {
        assert.equal(name,"finalize_zalo_official_source_v1");officialRpcCalls++;
        assert.equal(args.p_pending.auto_approve_enabled,false);
        assert.equal(args.p_pending.status,"Chờ duyệt");
        tables.zalo_import_batches.push(structuredClone(args.p_batch));
        tables.pending_room_versions.push(structuredClone(args.p_pending));
        tables.zalo_import_images.push(...structuredClone(args.p_images));tables.zalo_import_videos.push(...structuredClone(args.p_videos));
        return {data:{pending_id:args.p_pending.id,created:true},error:null};
      } }) },
    "@/lib/zalo-import/parser": { parseZaloRoomText },
    "@/lib/zalo-import/resolve": { resolveZaloImportRoom },
    "@/lib/zalo-import/incoming-change": { findImportBaseline, assessIncomingChange },
    "@/lib/zalo-import/quality": { evaluateZaloImportQuality: () => ({ score_fraction: 0.8, eligible: officialRequestActive, auto_import: {} }), readZaloAutoImportSettings: () => ({ enabled: true, dryRun: false }) },
    "@/lib/zalo-import/publish-pending-room": { publishPendingRoom: () => { throw new Error("test must never publish"); } },
    "@/lib/zalo-reader/controlled-staging": { isControlledZaloTarget, shouldAutoPublishZaloImport, makeTestPendingIdentity },
    "@/lib/r2/zalo-temp": {
      makeZaloTempImageKey: (batch: string, id: string) => `test/${batch}/${id}`,
      uploadBufferToR2: async ({ key }: { key: string }) => { uploads += 1; return { key, url: `https://example.test/${key}` }; },
      deleteR2Keys: async () => 0,
    },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports,
    require: (name: string) => { assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name]; },
    process: { env: { ZALO_READER_INTERNAL_SECRET: "offline-fixture" } },
    Buffer, URL, Date, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => { throw new Error("fixture video download failed"); },
  });
  const now = Date.now();
  const body = {
    groupName: CONTROLLED_ZALO_GROUP_NAME, groupId: CONTROLLED_ZALO_GROUP_ID,
    stagingOnly: true, readerStartedAtMs: now, testImportToPending: true,
    senderName: "Fixture", sourceMessageId: "fixture-source", sourceHash: "real-source-hash",
    sentAt: new Date(now - 1000).toISOString(),
    rawText: "10 Nguyễn Huệ, Q1\n\nStudio/CS - 5.500.000 - P.402 - trống",
    expectedImageCount: 1, expectedVideoCount: 1,
    images: [{ mimeType: "image/webp", base64: Buffer.from("fixture-image").toString("base64") }],
    videos: [],
  };
  tables.rooms.push({ id: "main-room", house_number: "10", address: "Nguyễn Huệ", district: "Quận 1", room_code: "402", price: 5000000, room_type: "1PN" });
  const mainBefore = JSON.stringify(tables.rooms);
  async function request(overrides: Record<string, unknown> = {}) {
    const response = await module.exports.POST(new Request("http://localhost/api/internal/zalo-reader/import", {
      method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": "offline-fixture" }, body: JSON.stringify({ ...body, ...overrides }),
    }));
    return { status: response.status, body: await response.json() };
  }
  tables.zalo_import_batches.push({ id: "real-batch", source_hash: body.sourceHash, status: "Chờ duyệt", parser_result: {} });
  tables.pending_room_versions.push({ id: "real-pending", batch_id: "real-batch", status: "Chờ duyệt", room_payload: { room_code: "REAL" } });
  const realBefore = JSON.stringify(tables.pending_room_versions[0]);
  const created = await request();
  assert.equal(created.status, 200);
  assert.equal(created.body.testPendingAction, "created");
  assert.equal(created.body.partial, true, "missing video remains an explicit error while a valid image permits Pending");
  const identity = makeTestPendingIdentity(body.groupId, body.sourceMessageId);
  assert.equal(created.body.pendingVersionId, identity.pendingId);
  const updated = await request({ rawText: body.rawText.replace("5.500.000", "6.000.000") });
  assert.equal(updated.body.testPendingAction, "updated");
  assert.equal(updated.body.pendingVersionId, identity.pendingId, "parser changes update the same test draft");
  assert.match(tables.zalo_import_batches.find((row) => row.id === identity.batchId)!.raw_text, /6\.000\.000/);
  assert.equal(tables.pending_room_versions.length, 2);
  assert.equal(JSON.stringify(tables.pending_room_versions[0]), realBefore);
  assert.equal(tables.zalo_import_images.filter((row) => row.batch_id === identity.batchId).length, 1);
  const testRow = tables.pending_room_versions.find((row) => row.id === identity.pendingId)!;
  assert.equal(testRow.status, "Chờ duyệt");
  assert.equal(testRow.room_payload.is_test_import, true);
  assert.equal(testRow.room_payload.price, 6_000_000);
  assert.equal(testRow.room_payload._room_import.type, "UPDATE", "new TEST drafts also compare existing rooms without mutating them");
  assert.equal(testRow.room_payload._room_import.snapshot.room.price, 5000000);
  assert.equal(testRow.auto_approve_enabled, false);
  const draftBefore = JSON.stringify(testRow);
  const uploadsBeforeNewSourceTrial = uploads;
  const oldTestSkipped = await request({ testNewSourcesOnly: true });
  assert.equal(oldTestSkipped.body.duplicate, true);
  assert.equal(oldTestSkipped.body.testPendingAction, "skipped-existing");
  assert.equal(JSON.stringify(testRow), draftBefore);
  assert.equal(uploads, uploadsBeforeNewSourceTrial);
  const empty = await request({ images: [], expectedImageCount: 0, videos: [{ sourceUrl: "https://media.dlmd.me/fixture.mp4" }] });
  assert.equal(empty.status, 422);
  assert.equal(JSON.stringify(testRow), draftBefore, "failed video-only retry preserves existing draft");
  const noNewEmpty = await request({ sourceMessageId: "empty-video-source", images: [], expectedImageCount: 0 });
  assert.equal(noNewEmpty.status, 422);
  assert.equal(tables.pending_room_versions.length, 2);
  const formal = await request({ testImportToPending: false });
  assert.equal(formal.body.duplicate, true, "official mode still deduplicates the original source");

  const publishModule = { exports: {} as { publishPendingRoom: (params: unknown) => Promise<unknown> } };
  const publishSource = fs.readFileSync(path.resolve(__dirname, "../../../lib/zalo-import/publish-pending-room.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(publishSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: publishModule, exports: publishModule.exports,
    require: (name: string) => dependencies[name], console,
  });
  await assert.rejects(() => publishModule.exports.publishPendingRoom({
    pendingId: identity.pendingId, actorUserId: "fixture-admin", supabase: { from: (table: string) => new Query(table) },
  }), /TEST/);
  const formalUpdate = await request({ testImportToPending: false, sourceMessageId: "new-formal-source", sourceHash: "new-formal-hash" });
  assert.equal(formalUpdate.status, 200);
  const formalRow = tables.pending_room_versions.find(row => row.id === formalUpdate.body.pendingVersionId)!;
  assert.equal(formalRow.matched_room_id, "main-room");
  assert.equal(formalRow.room_payload._room_import.type, "UPDATE");
  const countBeforeDuplicate = tables.pending_room_versions.length;
  const uploadBeforeDuplicate = uploads;
  const batchCountBeforeUnchanged = tables.zalo_import_batches.length;
  const unchanged = await request({ testImportToPending: false, sourceMessageId: "unimported-but-identical", sourceHash: "unimported-identical-hash", expectedVideoCount: 0 });
  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.body.noChanges, true);
  assert.equal(unchanged.body.baselineKind, "pending");
  assert.equal(unchanged.body.pendingVersionId, undefined);
  assert.equal(uploads, uploadBeforeDuplicate);
  assert.equal(tables.pending_room_versions.length, countBeforeDuplicate);
  assert.equal(tables.zalo_import_batches.length, batchCountBeforeUnchanged, "unchanged new source must not create an import batch or Pending");
  const duplicateRoom = await request({ testImportToPending: false, sourceMessageId: "another-zalo-source", sourceHash: "another-formal-hash" });
  assert.equal(duplicateRoom.status, 409);
  assert.equal(duplicateRoom.body.code, "ROOM_PENDING_EXISTS");
  assert.equal(tables.pending_room_versions.length, countBeforeDuplicate);
  assert.equal(uploads, uploadBeforeDuplicate, "do not upload media for a conflicting active Pending");
  assert.equal((await request({ testImportToPending: false, sourceMessageId: "new-formal-source", sourceHash: "new-formal-hash" })).body.duplicate, true);
  const formalCreate = await request({ testImportToPending: false, sourceMessageId: "different-room-source", sourceHash: "different-room-hash", rawText: body.rawText.replace("10 Nguyễn", "11 Nguyễn") });
  assert.equal(formalCreate.status, 200);
  assert.equal(tables.pending_room_versions.find(row => row.id === formalCreate.body.pendingVersionId)!.room_payload._room_import.type, "CREATE");
  assert.equal(JSON.stringify(tables.rooms), mainBefore, "neither import mode writes existing main rooms");
  const identicalText = body.rawText.replace("10 Nguyễn", "12 Nguyễn");
  const identicalParsed = parseZaloRoomText(identicalText);
  tables.rooms.push({ id: "identical-main", ...identicalParsed.roomPayload });
  tables.room_details.push({ id: "identical-main-detail", room_id: "identical-main", ...identicalParsed.detailPayload });
  const noMedia = { testImportToPending: false, images: [], expectedImageCount: 0, videos: [], expectedVideoCount: 0 };
  const pendingCountBeforeMainCheck = tables.pending_room_versions.length;
  const mainUnchanged = await request({ ...noMedia, rawText: identicalText, sourceMessageId: "same-as-main", sourceHash: "same-main-hash" });
  assert.equal(mainUnchanged.body.noChanges, true);
  assert.equal(mainUnchanged.body.baselineKind, "room");
  assert.equal(tables.pending_room_versions.length, pendingCountBeforeMainCheck);
  const trialUnchanged = await request({ ...noMedia, testImportToPending: true, testNewSourcesOnly: true,
    rawText: identicalText, sourceMessageId: "test-new-source-identical", sourceHash: "ignored-test-hash" });
  assert.equal(trialUnchanged.body.noChanges, true);
  assert.equal(tables.pending_room_versions.length, pendingCountBeforeMainCheck);
  const changedMain = await request({ ...noMedia, rawText: identicalText.replace("5.500.000", "5.800.000"), sourceMessageId: "changed-main", sourceHash: "changed-main-hash" });
  assert.equal(changedMain.status, 200);
  const changedPending = tables.pending_room_versions.find(row => row.id === changedMain.body.pendingVersionId)!;
  assert.equal(changedPending.room_payload._room_import.type, "UPDATE");
  assert.equal(changedPending.room_payload.price, 5800000);
  assert.equal(changedPending.matched_room_id, "identical-main");
  assert.equal(tables.rooms.find(row => row.id === "identical-main")!.price, 5500000);
  const historyText = body.rawText.replace("10 Nguyễn", "13 Nguyễn");
  const historyParsed = parseZaloRoomText(historyText);
  tables.zalo_import_batches.push({ id: "history-only", status: "Từ chối", parser_result: { room_payload: historyParsed.roomPayload, detail_payload: historyParsed.detailPayload } });
  const historyUnchanged = await request({ ...noMedia, rawText: historyText, sourceMessageId: "same-history", sourceHash: "same-history-hash" });
  assert.equal(historyUnchanged.body.noChanges, true);
  assert.equal(historyUnchanged.body.baselineKind, "history");
  assert.equal(tables.zalo_import_batches.find(row => row.id === "history-only")!.status, "Từ chối");
  testRow.status = "Từ chối";
  assert.equal((await request()).status, 409, "handled test drafts are not silently reopened");
  testRow.status = "Chờ duyệt";
  testRow.room_payload.is_test_import = false;
  const uploadsBefore = uploads;
  assert.equal((await request()).status, 409, "cannot overwrite a real pending row");
  assert.equal(uploads, uploadsBefore);
  // Official two-group mode uses the same handler/parser/media code; all DB
  // links are finalized in one RPC, even when auto-publish settings are enabled.
  const untouchedTestRows = Array.from({length:8},(_,i)=>({id:`untouched-test-${i}`,batch_id:`untouched-batch-${i}`,status:"Chờ duyệt",room_payload:{is_test_import:true}}));
  tables.pending_room_versions.push(...untouchedTestRows);
  const untouchedBefore=JSON.stringify(untouchedTestRows);
  const officialRunId=crypto.randomUUID();
  for(const group of OFFICIAL_ZALO_GROUPS) tables.zalo_reader_runs.push({run_id:officialRunId,group_key:group.key,group_id:group.groupId||"g1234567890123",mode:"trial",status:"running",window_from:new Date(now-86400000).toISOString(),window_to:new Date(now).toISOString()});
  const officialText=body.rawText.replace("10 Nguyễn","41 Nguyễn");
  const officialRoom=parseZaloRoomText(officialText).roomPayload;
  const officialBody={officialReader:true,officialTrial:true,officialRunId,groupIdVerified:true,sourceRoomKey:normalizedRoomIdentity(officialRoom),
    rawText:officialText,sourceMessageId:"official-source-41",testImportToPending:false,stagingOnly:false};
  officialRequestActive=true;
  const officialCreated=await request(officialBody);
  assert.equal(officialCreated.status,200);
  assert.equal(officialCreated.body.autoPublished,false);
  assert.equal(officialCreated.body.partial,true,"photo succeeds, missing video still warns");
  const officialPending=tables.pending_room_versions.find(row=>row.id===officialCreated.body.pendingVersionId)!;
  assert.equal(officialPending.room_payload.is_test_import,true);
  assert.equal(officialPending.room_payload._reader_manual_review,true);
  assert.equal(officialPending.room_payload._room_import.type,"CREATE");
  const afterCreate=uploads;
  assert.equal((await request(officialBody)).body.duplicate,true);
  assert.equal(uploads,afterCreate,"idempotent retry does not re-upload");
  assert.equal(officialRpcCalls,1);
  const crossGroup=await request({...officialBody,groupName:OFFICIAL_ZALO_GROUPS[1].name,groupId:"g1234567890123",sourceMessageId:"group-two-same-room",expectedVideoCount:0});
  // TEST drafts are intentionally excluded from formal room baselines.
  assert.equal(crossGroup.status,200);
  assert.equal(officialRpcCalls,2);
  const beforeEmpty=tables.pending_room_versions.length;
  const officialEmpty=await request({...officialBody,rawText:officialText.replace("41 Nguyễn","42 Nguyễn"),
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(officialText.replace("41 Nguyễn","42 Nguyễn")).roomPayload),sourceMessageId:"official-video-empty",images:[],expectedImageCount:0});
  assert.equal(officialEmpty.status,422);
  assert.equal(officialEmpty.body.code,"NO_USABLE_MEDIA");
  assert.equal(tables.pending_room_versions.length,beforeEmpty);
  assert.equal(officialRpcCalls,2);
  assert.equal(JSON.stringify(untouchedTestRows),untouchedBefore,"existing 8 TEST Pending untouched");
  const productionRunId=crypto.randomUUID();
  tables.zalo_reader_runs.push({run_id:productionRunId,group_key:OFFICIAL_ZALO_GROUPS[0].key,group_id:OFFICIAL_ZALO_GROUPS[0].groupId,mode:"official",status:"running",window_from:new Date(now-86400000).toISOString(),window_to:new Date(now).toISOString()});
  const productionText=officialText.replace("41 Nguyễn","43 Nguyễn");
  const production=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"production-source-43",rawText:productionText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(productionText).roomPayload),expectedVideoCount:0,albumExpectedImageCount:2,mediaVerification:"VERIFIED"});
  assert.equal(production.status,200);
  const productionRow=tables.pending_room_versions.find(row=>row.id===production.body.pendingVersionId)!;
  const productionBatch=tables.zalo_import_batches.find(row=>row.id===productionRow.batch_id)!;
  assert.equal(productionRow.room_payload.is_test_import,undefined,"production must not inherit TEST");
  assert.equal(productionBatch.parser_result.test_import,undefined);
  assert.equal(productionBatch.parser_result.official_source.trial,false);
  assert.equal(productionRow.status,"Chờ duyệt");assert.equal(productionRow.auto_approve_enabled,false);
  assert.equal(production.body.mediaVerification,"MEDIA_INCOMPLETE","one uploaded photo cannot prove a two-photo album complete");
  assert.equal(production.body.autoPublished,false);
  productionRow.room_payload.price=7_777_777; // admin edited the draft after import
  const manualDraftBefore=JSON.stringify(productionRow);
  const productionAgain=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"production-source-43",rawText:productionText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(productionText).roomPayload),expectedVideoCount:0});
  assert.equal(productionAgain.body.duplicate,true);assert.equal(JSON.stringify(productionRow),manualDraftBefore,"production retry never overwrites manual draft edits");
  const productionEmptyText=productionText.replace("43 Nguyễn","44 Nguyễn");
  const productionEmpty=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"production-empty",rawText:productionEmptyText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(productionEmptyText).roomPayload),images:[],videos:[],expectedImageCount:0,expectedVideoCount:0});
  assert.equal(productionEmpty.status,422,"production rejects empty media even when no media was declared");assert.equal(productionEmpty.body.code,"NO_USABLE_MEDIA");
  for(const [code,text] of [
    ["402","77 Nguyễn Huệ, Q1\n\nStudio/CS - 5.500.000 - P.402 - trống"],
    ["503","100/2A2 Trần Hưng Đạo, Q1\nPhí điện: 4.000/Kwh\nPhí nước: 150k/ng\nPhí dịch vụ: 200k/p\nPhí xe: 100k/xe\nThang: máy\nGiặt sấy chung tại căn\n\n2PN/BC/1PK - 16.000.000 - P.503 - trống 5/11"],
  ]) {
    const requestBody={...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:`video-only-${code}`,rawText:text,
      sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(text).roomPayload),images:[],videos:[],expectedImageCount:0,expectedVideoCount:1,videoSourceMessageIds:[`video-${code}`]};
    const videoOnly=await request(requestBody);
    assert.equal(videoOnly.status,200);assert.equal(videoOnly.body.manualVideoRequired,true);assert.equal(videoOnly.body.partial,true);
    const row=tables.pending_room_versions.find(row=>row.id===videoOnly.body.pendingVersionId)!;
    assert.equal(row.room_payload.room_code,code);assert.equal(row.room_payload._manual_video_required,true);
    assert.equal(row.room_payload.has_video,false,"missing video is never reported as saved");assert.equal(row.auto_approve_enabled,false);
    assert.equal(row.room_payload.import_diagnostics.video_source_message_ids[0],`video-${code}`);
    assert.ok(row.room_payload.import_diagnostics.issues.some((issue:any)=>issue.code==="VIDEO_MANUAL_UPLOAD_REQUIRED"));
    assert.equal(tables.zalo_import_videos.filter(video=>video.batch_id===row.batch_id).length,0);
    assert.equal(row.room_payload.is_test_import,undefined);
    const beforeRetry=JSON.stringify(row);assert.equal((await request(requestBody)).body.duplicate,true);assert.equal(JSON.stringify(row),beforeRetry);
  }
  const unknownVideo=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"unknown-video-empty",rawText:productionEmptyText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(productionEmptyText).roomPayload),images:[],videos:[],expectedImageCount:0,expectedVideoCount:1,videoSourceMessageIds:[]});
  assert.equal(unknownVideo.status,422,"no source video evidence must not manufacture an empty room");
  const unanchoredVideo=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"unanchored-video-empty",rawText:"88 Nguyễn Huệ, Q1",
    sourceRoomKey:`unresolved:${"a".repeat(64)}`,images:[],videos:[],expectedImageCount:0,expectedVideoCount:1,videoSourceMessageIds:["orphan-video"]});
  assert.equal(unanchoredVideo.status,422,"video without a room anchor must not become a fabricated Pending room");
  const productionUpdateText=body.rawText.replace("5.500.000","6.800.000");
  const productionUpdated=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"production-update-main",rawText:productionUpdateText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(productionUpdateText).roomPayload),expectedVideoCount:0});
  assert.equal(productionUpdated.status,409,"conflicting real Pending must not be overwritten");
  const cleanUpdateText=productionUpdateText.replace("10 Nguyễn","55 Nguyễn");
  tables.rooms.push({id:"production-main-55",...parseZaloRoomText(cleanUpdateText.replace("6.800.000","6.000.000")).roomPayload});
  const cleanUpdate=await request({...officialBody,officialTrial:false,officialRunId:productionRunId,sourceMessageId:"production-update-55",rawText:cleanUpdateText,
    sourceRoomKey:normalizedRoomIdentity(parseZaloRoomText(cleanUpdateText).roomPayload),expectedVideoCount:0});
  assert.equal(cleanUpdate.status,200);
  const cleanUpdateRow=tables.pending_room_versions.find(row=>row.id===cleanUpdate.body.pendingVersionId)!;
  assert.equal(cleanUpdateRow.matched_room_id,"production-main-55");assert.equal(cleanUpdateRow.room_payload._room_import.type,"UPDATE");
  assert.equal(tables.rooms.find(row=>row.id==="production-main-55")!.price,6_000_000,"production import never changes main rooms before manual approval");
  assert.equal(JSON.stringify(untouchedTestRows),untouchedBefore);
  assert.equal(JSON.stringify(tables.rooms.filter(row=>row.id==="main-room")),mainBefore);
  officialRequestActive=false;
  await assert.rejects(()=>publishModule.exports.publishPendingRoom({pendingId:"official",actorUserId:"fixture-admin",source:"auto",
    supabase:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:"official",room_payload:{_reader_manual_review:true}},error:null})})}}),/OFFICIAL_MANUAL_REVIEW_REQUIRED/);
  console.log("Pending test API: create/update, real draft protection, missing video, empty media rejection, official dedup PASS (offline)");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
