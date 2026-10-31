import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as comparison from "../../../lib/zalo-import/room-comparison";
import { zaloImportErrorMessage } from "../../../lib/zalo-import/error-message";
import { snapshotRoom, normalizedRoomIdentity, type ImportReview } from "../../../lib/zalo-import/room-comparison";

// Optional OFFLINE_SQL_RUNTIME points to an external test-tool installation.
// No dependency is added to the application; no network/production DB is used.
const runtime = process.env.OFFLINE_SQL_RUNTIME || path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite");
const { PGlite } = createRequire(path.resolve("package.json"))(runtime);

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table rooms(id uuid primary key, room_code text, house_number text, address text, district text,
        ward text, room_type text, price numeric, status text, available_from date, description text, chinh_sach text, updated_at timestamptz default now());
      create table room_details(id uuid primary key, room_id uuid unique, water_fee_value numeric, water_fee_unit text,
        has_elevator boolean, other_fee_note text);
      create table room_media(id uuid primary key default gen_random_uuid(), room_id uuid, provider text, type text, url text, path text, is_cover boolean, sort_order integer);
      create table zalo_import_batches(id uuid primary key, status text, parser_result jsonb default '{}');
      create table pending_room_versions(id uuid primary key, batch_id uuid, status text, room_payload jsonb, detail_payload jsonb,
        matched_room_id uuid, approved_room_id uuid, approved_at timestamptz, approved_by uuid,
        auto_approve_enabled boolean, auto_approve_at timestamptz, auto_approve_actor_id uuid, auto_approve_processing_at timestamptz);
    `);
    await db.exec(fs.readFileSync(path.resolve("supabase/sql/zalo-import-room-updates.sql"), "utf8"));
    const roomId = randomUUID(), batchId = randomUUID(), pendingId = randomUUID(), actorId = randomUUID();
    const q = (sql: string, args: any[] = []) => db.query(sql, args);
    const scalar = async (sql: string, args: any[] = []) => (await q(sql, args)).rows[0];
    async function reset() {
      await db.exec("truncate rooms, room_details, room_media, pending_room_versions, zalo_import_batches");
      await q("insert into rooms(id,room_code,house_number,address,district,room_type,price,status,available_from,description) values($1,'L01','219/89A','Trần Văn Đang','Quận 3','1PN',5500000,'Trống','2026-11-01','Giữ mô tả cũ')", [roomId]);
      await q("insert into room_details(id,room_id,water_fee_value,water_fee_unit,has_elevator,other_fee_note) values($1,$2,150000,'người/tháng',true,'Phí cũ')", [randomUUID(), roomId]);
      await q("insert into room_media(room_id,type,url,path,sort_order) values($1,'image','old-image','old-image',0)", [roomId]);
      const room = (await scalar("select to_jsonb(r) data from rooms r where id=$1", [roomId])).data;
      const detail = (await scalar("select to_jsonb(d) data from room_details d where room_id=$1", [roomId])).data;
      const media = (await q("select * from room_media where room_id=$1 order by sort_order", [roomId])).rows;
      const review: ImportReview = { version: 1, type: "UPDATE", identity_key: normalizedRoomIdentity(room), reason: "fixture", candidate_ids: [roomId], conflicting_pending_ids: [],
        snapshot: snapshotRoom(room, detail, media), presence: { "room.price": "value", "room.room_type": "value", "detail.has_elevator": "value", "detail.other_fee_note": "clear" }, uncertain_fields: [] };
      const payload = { ...room, price: 5800000, room_type: "Studio", description: "", available_from: null, _room_import: review };
      const detailPayload = { has_elevator: false, other_fee_note: "", water_fee_value: null };
      await q("insert into zalo_import_batches(id,status) values($1,'Chờ duyệt')", [batchId]);
      await q("insert into pending_room_versions(id,batch_id,status,room_payload,detail_payload,matched_room_id) values($1,$2,'Trùng phòng',$3,$4,$5)", [pendingId,batchId,payload,detailPayload,roomId]);
      return { payload, detailPayload };
    }
    const approve = (fixture: Awaited<ReturnType<typeof reset>>, fields: string[], media: any[] = []) => q(
      "select public.approve_zalo_room_update_v1($1,$2,$3,$4,$5,$6) result", [pendingId,actorId,fields,fixture.payload,fixture.detailPayload,media]);

    // Execute the real authenticated HTTP route and update service, backed by
    // this in-memory PostgreSQL. Storage calls are forbidden for a price edit.
    const adapter = {
      from(table: string) {
        assert.equal(table, "pending_room_versions");
        let id: string;
        const query = { select() { return this; }, eq(_key: string, value: string) { id = value; return this; },
          async single() { return this.maybeSingle(); },
          async maybeSingle() {
            const row = await scalar("select to_jsonb(p) data from pending_room_versions p where id=$1", [id]);
            return { data: row ? { ...row.data, batch: {} } : null, error: null };
          } };
        return query;
      },
      async rpc(name: string, args: any) {
        assert.equal(name, "approve_zalo_room_update_v1");
        try {
          const result = await q("select public.approve_zalo_room_update_v1($1,$2,$3,$4,$5,$6) data", [args.p_pending_id,args.p_actor_id,args.p_selected_fields,args.p_expected_payload,args.p_expected_detail,args.p_media]);
          return { data: result.rows[0].data, error: null };
        } catch (error) { return { data: null, error }; }
      },
    };
    const dependencies: Record<string, any> = {
      "node:crypto": crypto, crypto,
      "@/lib/zalo-import/room-comparison": comparison, "./room-comparison": comparison,
      "@/lib/zalo-import/error-message": { zaloImportErrorMessage },
      "@/lib/r2/zalo-temp": { copyR2Object() { throw new Error("unselected media must never be copied"); }, deleteR2Keys: async () => {}, makeRoomImageKey() {} },
      "@/lib/supabase/admin": { createSupabaseAdminClient: () => adapter },
      "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: actorId } }, error: null }) }, rpc: async () => ({ data: 1, error: null }) }) },
      "next/server": { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    };
    function load(file: string): any {
      const module = { exports: {} };
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
        { module, exports: module.exports, require: (name: string) => dependencies[name], console: { error() {}, warn() {} }, process, Date, Buffer });
      return module.exports;
    }
    dependencies["@/lib/zalo-import/update-pending-room"] = load("lib/zalo-import/update-pending-room.ts");
    dependencies["@/lib/zalo-import/publish-pending-room"] = load("lib/zalo-import/publish-pending-room.ts");
    const endpoint = load("app/api/admin/zalo-imports/[id]/approve/route.ts");
    let endpointFixture = await reset();
    const request = (mode: string, fields: string[] = []) => endpoint.POST(new Request("http://offline.test/approve", { method: "POST", body: JSON.stringify({ mode, selectedFields: fields,
      expectedRoomPayload: endpointFixture.payload, expectedDetailPayload: endpointFixture.detailPayload }) }), { params: Promise.resolve({ id: pendingId }) });
    assert.equal((await request("create_room")).status, 409, "UPDATE cannot use CREATE even through a forged HTTP request");
    assert.equal((await request("update_status")).status, 409, "new UPDATE cannot bypass field selection through legacy mode");
    const response = await request("update_room", ["room.price"]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).roomId, roomId);
    assert.equal(Number((await scalar("select price from rooms where id=$1", [roomId])).price), 5800000);
    assert.equal((await scalar("select count(*)::int n from rooms")).n, 1);
    endpointFixture = await reset();
    await q("update pending_room_versions set room_payload=jsonb_set(room_payload,'{price}','6500000') where id=$1", [pendingId]);
    assert.equal((await request("update_room", ["room.price"])).status, 409, "stale comparison UI cannot approve a different draft value");
    assert.equal(Number((await scalar("select price from rooms where id=$1", [roomId])).price), 5500000);

    let fixture = await reset();
    await approve(fixture, ["room.price", "detail.has_elevator", "detail.other_fee_note"]);
    let current = await scalar("select * from rooms where id=$1", [roomId]);
    assert.equal(Number(current.price), 5800000);
    assert.equal(current.room_type, "1PN", "unselected type is not applied");
    assert.equal(current.description, "Giữ mô tả cũ", "missing Zalo description cannot erase old data");
    assert.ok(current.available_from, "missing vacancy date cannot erase old date");
    assert.equal((await scalar("select count(*)::int n from rooms")).n, 1, "UPDATE never creates a room");
    let detail = await scalar("select * from room_details where room_id=$1", [roomId]);
    assert.equal(Number(detail.water_fee_value), 150000);
    assert.equal(detail.has_elevator, false);
    assert.equal(detail.other_fee_note, "", "an explicit, selected clear is applied");
    assert.equal((await scalar("select status from pending_room_versions where id=$1", [pendingId])).status, "Đã duyệt");
    await assert.rejects(approve(fixture, ["room.price"]), /PENDING_CHANGED/);

    fixture = await reset();
    await q("update rooms set price=6200000 where id=$1", [roomId]);
    await assert.rejects(approve(fixture, ["room.price"]), /ROOM_CHANGED/);
    assert.equal(Number((await scalar("select price from rooms where id=$1", [roomId])).price), 6200000);
    assert.equal((await scalar("select status from pending_room_versions where id=$1", [pendingId])).status, "Trùng phòng");

    fixture = await reset();
    await q("update room_details set water_fee_value=200000 where room_id=$1", [roomId]);
    await assert.rejects(approve(fixture, ["room.price"]), /ROOM_CHANGED/);
    fixture = await reset();
    await q("update room_media set url='changed-image' where room_id=$1", [roomId]);
    await assert.rejects(approve(fixture, ["room.price"]), /ROOM_CHANGED/);

    fixture = await reset();
    await assert.rejects(approve(fixture, ["room.price", "images"]), /EMPTY_MEDIA/);
    assert.equal(Number((await scalar("select price from rooms where id=$1", [roomId])).price), 5500000, "late failure rolls back ALL changes");
    assert.equal((await scalar("select url from room_media where room_id=$1", [roomId])).url, "old-image");
    await approve(fixture, ["room.room_type", "images"], [{ type: "image", url: "new-image", path: "new-image", is_cover: true, sort_order: 0 }]);
    assert.equal((await scalar("select room_type from rooms where id=$1", [roomId])).room_type, "Studio");
    assert.equal((await scalar("select url from room_media where room_id=$1", [roomId])).url, "new-image");

    fixture = await reset();
    await assert.rejects(approve(fixture, ["detail.water_fee_value"]), /MISSING_NEW_VALUE/);
    await assert.rejects(approve(fixture, ["room.owner_id"]), /MISSING_NEW_VALUE|INVALID_FIELD/);
    await q("update pending_room_versions set status='Từ chối' where id=$1", [pendingId]);
    await assert.rejects(approve(fixture, ["room.price"]), /PENDING_CHANGED/);
    assert.equal(Number((await scalar("select price from rooms where id=$1", [roomId])).price), 5500000);

    fixture = await reset();
    await q("delete from rooms where id=$1", [roomId]);
    await assert.rejects(approve(fixture, ["room.price"]), /TARGET_ROOM_MISSING/);
    assert.equal((await scalar("select count(*)::int n from rooms")).n, 0);
    fixture = await reset();
    await q("update pending_room_versions set room_payload=jsonb_set(room_payload,'{is_test_import}','true') where id=$1", [pendingId]);
    await assert.rejects(approve(fixture, ["room.price"]), /TEST_IMPORT_FORBIDDEN/);

    fixture = await reset();
    await assert.rejects(q("insert into pending_room_versions(id,batch_id,status,room_payload,detail_payload) values($1,$2,'Chờ duyệt',$3,'{}')", [randomUUID(),randomUUID(),fixture.payload]), /unique|duplicate/i,
      "two source messages cannot create uncontrolled active Pending duplicates");
    await q("update pending_room_versions set room_payload=jsonb_set(room_payload,'{price}','5900000') where id=$1", [pendingId]);
    await assert.rejects(approve(fixture, ["room.price"]), /PENDING_CHANGED/);
    await db.exec("set role authenticated");
    await assert.rejects(approve(fixture, ["room.price"]), /permission denied/i, "RPC cannot bypass admin endpoint");
    await db.exec("reset role");
    console.log("Offline PostgreSQL transaction integration: selected update, no CREATE, missing values, explicit clear, snapshots, rejection, deleted target, media rollback, duplicate Pending, TEST/RPC protection PASS");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
