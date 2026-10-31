import assert from "node:assert/strict";
import { classifyRoomIdentity, normalizedRoomIdentity, sourcePresence, snapshotRoom, compareImageAlbums, comparisonFields, selectedUpdatePatch, importReviewInstructions, type ImportReview } from "../../../lib/zalo-import/room-comparison";
import { resolveZaloImportRoom } from "../../../lib/zalo-import/resolve";
import { parseZaloRoomText } from "../../../lib/zalo-import/parser";

const old = { id: "old-room", house_number: "219/89A", address: "Trần Văn Đang", district: "Quận 3", room_code: "L01", room_type: "1PN", price: 5_500_000, ward: "Phường cũ" };
const incoming = { ...old, id: undefined, house_number: "219/89a", address: "tran van dang", district: "Q3", room_code: "P.L01", room_type: "Studio", price: 5_800_000 };
assert.equal(normalizedRoomIdentity(old), normalizedRoomIdentity(incoming));
assert.equal(normalizedRoomIdentity({ ...old, district: "Hóc Môn" }), normalizedRoomIdentity({ ...old, district: "Huyện Hóc Môn" }));
assert.equal(normalizedRoomIdentity(old), normalizedRoomIdentity({ ...incoming, room_code: "Phòng L01", address: " Trần  Văn  Đang, " }));
for (const changed of [{ price: 9_000_000 }, { room_type: "2PN" }, { images: ["different"] }, { ward: "Phường mới" }]) {
  assert.equal(classifyRoomIdentity({ ...incoming, ...changed }, [old]).type, "UPDATE");
}
for (const changed of [{ house_number: "219/89B" }, { house_number: "21989A" }, { room_code: "L02" }, { room_code: "L01A" }, { district: "Q10" }]) {
  assert.equal(classifyRoomIdentity({ ...incoming, ...changed }, [old]).type, "CREATE");
}
for (const key of ["house_number", "address", "district", "room_code"]) {
  assert.equal(classifyRoomIdentity({ ...incoming, [key]: "" }, [old]).type, "NEEDS_REVIEW");
}
assert.equal(classifyRoomIdentity(incoming, [old, { ...old, id: "other" }]).type, "NEEDS_REVIEW");
assert.equal(classifyRoomIdentity({ ...old, address: "Trần Văn Đăng" }, [old]).type, "NEEDS_REVIEW", "two disagreeing accented names need review");
assert.notEqual(normalizedRoomIdentity({ ...old, house_number: "12Đ" }), normalizedRoomIdentity({ ...old, house_number: "12D" }));
assert.equal(classifyRoomIdentity(incoming, [{ ...old, lifecycle_status: "archived" }]).type, "NEEDS_REVIEW");
const activePending = { id: "existing-pending", status: "Chờ duyệt", room_payload: old };
assert.equal(classifyRoomIdentity(incoming, [old], [activePending]).type, "NEEDS_REVIEW");
assert.equal(classifyRoomIdentity(incoming, [old], [activePending], activePending.id).type, "UPDATE");
assert.equal(classifyRoomIdentity(incoming, [old], [{ ...activePending, status: "Từ chối" }]).type, "UPDATE");
const detail = { water_fee_value: null, water_fee_unit: "người/tháng", has_elevator: false, other_fee_note: "" };
const presence = sourcePresence(incoming, detail, { price: "Tin Zalo", room_type: "Tin Zalo", has_elevator: "Tin Zalo", other_fee_note: "Tin Zalo" });
assert.equal(presence["detail.water_fee_unit"], undefined, "default units without source are NOT new data");
assert.equal(presence["detail.has_elevator"], "value", "explicit false is meaningful");
assert.equal(presence["detail.other_fee_note"], "clear");
const review: ImportReview = { version: 1, type: "UPDATE", identity_key: normalizedRoomIdentity(old), reason: "fixture", candidate_ids: [old.id], conflicting_pending_ids: [],
  snapshot: snapshotRoom(old, { water_fee_value: 150000, has_elevator: true, other_fee_note: "Old fee" }, []), presence, uncertain_fields: [] };
const payload = { ...incoming, _room_import: review };
const fields = comparisonFields(payload, detail);
assert.equal(fields.find(field => field.field === "price")?.state, "changed");
assert.equal(comparisonFields({ ...payload, price: old.price }, detail).find(field => field.field === "price")?.state, "same");
assert.equal(fields.find(field => field.field === "water_fee_value")?.state, "missing");
const patch = selectedUpdatePatch(payload, detail, ["room.price", "detail.has_elevator", "detail.other_fee_note"]);
assert.deepEqual(patch.room, { price: 5800000 });
assert.deepEqual(patch.detail, { has_elevator: false, other_fee_note: "" });
assert.throws(() => selectedUpdatePatch(payload, detail, ["detail.water_fee_value"]), /dữ liệu mới/);
assert.throws(() => selectedUpdatePatch(payload, detail, ["room.owner_id"]), /dữ liệu mới/);
assert.equal(compareImageAlbums([{ content_hash: "a" }], [{ content_hash: "b" }]), "changed", "same count, different content");
assert.equal(compareImageAlbums([{ url: "old", content_hash: "a" }], [{ url: "new", content_hash: "a" }]), "same", "different storage URL, same bytes");
assert.equal(compareImageAlbums([{ url: "old" }], [{ url: "new" }]), "uncertain");
assert.equal(compareImageAlbums([{ url: "same" }], [{ url: "same" }]), "uncertain", "URL alone is not a content hash");
const dateOnly = parseZaloRoomText("219/89A Trần Văn Đang, Q3\nPhí nước: 25k/khối\n\nStudio - 5.800.000 - P.L01 - trống 5/11");
assert.match(dateOnly.roomPayload.available_from, /^\d{4}-11-05$/);assert.equal(dateOnly.roomPayload.status,"Sắp trống");
assert.equal(dateOnly.roomPayload.available_from_text, "5/11");
assert.equal(dateOnly.detailPayload.water_fee_unit, "m3");
assert.ok(dateOnly.sourceFieldMap.water_fee_unit);
const dated = parseZaloRoomText("219/89A Trần Văn Đang, Q3\n\nStudio - 5.800.000 - P.L01 - trống 5/11/2026");
assert.equal(dated.roomPayload.available_from, "2026-11-05");
const costUnits = parseZaloRoomText("219/89A Trần Văn Đang, Q3\nPhí điện: 4k/Kwh\nPhí nước: 25k/m3\nPhí dịch vụ: 200k/p\nPhí xe: 100k/xe\n\nStudio - 5.800.000 - P.L01 - trống");
assert.deepEqual([costUnits.detailPayload.electric_fee_unit, costUnits.detailPayload.water_fee_unit, costUnits.detailPayload.service_fee_unit, costUnits.detailPayload.parking_fee_unit], ["kWh", "m3", "phòng", "chiếc"]);
const removed = parseZaloRoomText("219/89A Trần Văn Đang, Q3\nPhí dịch vụ: không áp dụng\nKhông còn thang máy\n\nStudio - 5.800.000 - P.L01 - trống");
assert.equal(removed.detailPayload.service_fee_value, 0);
assert.equal(removed.detailPayload.has_elevator, false);

const g01Source = "88A Nguyễn Trọng Tuyển, Phú Nhuận\n- Phí dịch vụ: 200k/p\n- Giặt sấy chung tại căn\n- Phí điện: 4.000/Kwh\n- Phí nước: 100k/ng\n- Phí xe: free\n- Thang:\n\n2PN/BC/1PK - 10.500.000 -G01 - trống sẵn";
const g01 = parseZaloRoomText(g01Source);
assert.deepEqual([g01.roomPayload.house_number, g01.roomPayload.address, g01.roomPayload.district, g01.roomPayload.room_code, g01.roomPayload.room_type, g01.roomPayload.price], ["88A", "Nguyễn Trọng Tuyển", "Phú Nhuận", "G01", "2PN", 10500000]);
assert.equal(g01.sourceFieldMap.room_code, "Tin Zalo");
for (const code of ["G01", "g01", "402", "L01"]) {
  assert.equal(parseZaloRoomText(g01Source.replace("-G01", `- ${code}`)).roomPayload.room_code.toLowerCase(), code.toLowerCase());
}
for (const text of ["Album 21 ảnh", "2PN - 10.500.000 - Album 21 ảnh - trống sẵn", "2PN - 10.500.000 - trống 21/11"]) {
  assert.equal(parseZaloRoomText(`88A Nguyễn Trọng Tuyển, Phú Nhuận\n${text}`).roomPayload.room_code, "", "media count / vacancy date must never become a room code");
}
const staleReview = { ...review, type: "NEEDS_REVIEW" as const, identity_key: null, reason: "Thiếu số nhà, tên đường, quận hoặc mã phòng.", snapshot: null };
assert.match(importReviewInstructions({ ...g01.roomPayload, _room_import: staleReview }), /đã đủ[\s\S]*Phân tích lại dữ liệu/);
assert.match(importReviewInstructions({ ...g01.roomPayload, room_code: "", _room_import: staleReview }), /Thiếu số nhà/);
assert.match(importReviewInstructions({ ...g01.roomPayload, _room_import: { ...staleReview, identity_key: normalizedRoomIdentity(g01.roomPayload), reason: "Có nhiều phòng trùng khóa; cần xác minh phòng đích." } }), /Có nhiều phòng trùng khóa/);

async function main() {
  const tables: Record<string, any[]> = { rooms: [old], room_details: [{ room_id: old.id, water_fee_value: 150000 }], room_media: [], pending_room_versions: [] };
  class Query implements PromiseLike<any> {
    predicates: Array<(row: any) => boolean> = [];
    constructor(readonly table: string) {}
    select() { return this; } order() { return this; }
    eq(key: string, value: any) { this.predicates.push(row => row[key] === value); return this; }
    ilike() { return this; } in() { return this; }
    rows() { return tables[this.table].filter(row => this.predicates.every(test => test(row))); }
    range(start: number, end: number) { return Promise.resolve({ data: this.rows().slice(start, end + 1), error: null }); }
    maybeSingle() { return Promise.resolve({ data: this.rows()[0] || null, error: null }); }
    then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
    }
  }
  const supabase: any = { from: (table: string) => new Query(table) };
  tables.pending_room_versions = [{ id: "g01-pending", status: "Chờ duyệt", room_payload: g01.roomPayload }];
  const reparsedG01 = await resolveZaloImportRoom({ supabase, ...g01, excludePendingId: "g01-pending" });
  assert.equal(reparsedG01.roomPayload._room_import.type, "CREATE", "reparse clears missing-code review without conflicting with itself");
  const previousRooms = tables.rooms;
  tables.rooms = [{ ...g01.roomPayload, id: "existing-g01" }];
  const matchedG01 = await resolveZaloImportRoom({ supabase, ...g01, excludePendingId: "g01-pending" });
  assert.equal(matchedG01.roomPayload._room_import.type, "UPDATE", "existing G01 must still require explicit field comparison");
  tables.rooms.push({ ...g01.roomPayload, id: "ambiguous-g01" });
  assert.equal((await resolveZaloImportRoom({ supabase, ...g01, excludePendingId: "g01-pending" })).roomPayload._room_import.type, "NEEDS_REVIEW", "real ambiguity remains blocked");
  tables.rooms = previousRooms;
  tables.pending_room_versions = [];
  const resolved = await resolveZaloImportRoom({ supabase, roomPayload: incoming, detailPayload: detail, sourceFieldMap: { price: "Tin Zalo", room_type: "Tin Zalo" } });
  assert.equal(resolved.roomPayload._room_import.type, "UPDATE");
  assert.equal(resolved.roomPayload.price, 5800000);
  assert.equal(resolved.roomPayload._room_import.snapshot.room.price, 5500000);
  assert.equal(resolved.detailPayload.water_fee_value, null, "do not replace missing source with old values");
  tables.pending_room_versions.push(activePending);
  const duplicate = await resolveZaloImportRoom({ supabase, roomPayload: incoming, detailPayload: detail });
  assert.equal(duplicate.roomPayload._room_import.type, "NEEDS_REVIEW");
  assert.deepEqual(duplicate.roomPayload._room_import.conflicting_pending_ids, [activePending.id]);
  tables.pending_room_versions = [];
  tables.rooms = Array.from({ length: 1001 }, (_, index) => ({ ...old, id: `other-${index}`, house_number: "219/88B" })).concat([old]);
  const paged = await resolveZaloImportRoom({ supabase, roomPayload: incoming, detailPayload: detail });
  assert.equal(paged.matchedRoom.id, old.id, "match beyond default Supabase page limits");
  console.log("Room identity / UPDATE / CREATE / review / field presence / image SHA-256 / paged resolver: PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
