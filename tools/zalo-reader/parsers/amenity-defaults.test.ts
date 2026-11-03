import assert from "node:assert/strict";
import { parseZaloRoomText } from "../../../lib/zalo-import/parser";
import { preserveConfirmedFields } from "../../../lib/zalo-import/reparse-review";
import { normalizedRoomIdentity, selectedUpdatePatch, snapshotRoom } from "../../../lib/zalo-import/room-comparison";
import { parseAutoReadText } from "../../../app/admin/RoomModal/AutoReadModal";

const source = "88A Nguyễn Trọng Tuyển, Phú Nhuận\nStudio/BC - 5.800.000 - P.302 - trống sẵn";
const parsed = parseZaloRoomText(source);
assert.equal(parsed.detailPayload.has_balcony, true);
for (const field of ["has_window", "free_time", "fingerprint_lock"]) {
  assert.equal(parsed.detailPayload[field], true, `${field} is checked when importing`);
  assert.ok(parsed.sourceFieldMap[field], "defaults can be explicitly selected in UPDATE comparison");
  assert.equal(parsed.roomPayload._parse_review.evidence[field].kind, "inferred", "defaults must not be labeled as source facts");
}
const plain = parseZaloRoomText(source.replace("/BC", ""));
assert.notEqual(plain.detailPayload.has_window, true, "a room without a balcony does not imply a window");
assert.equal(plain.detailPayload.free_time, true);
assert.equal(plain.detailPayload.fingerprint_lock, true);
const oldRoom = { ...parsed.roomPayload, id: "main" };
parsed.roomPayload._room_import = {
  version: 1, type: "UPDATE", identity_key: normalizedRoomIdentity(oldRoom),
  snapshot: snapshotRoom(oldRoom, { has_window: false, free_time: false, fingerprint_lock: false }, []),
  presence: { "detail.has_window": "value", "detail.free_time": "value", "detail.fingerprint_lock": "value" },
  uncertain_fields: [],
};
const fields = ["detail.has_window", "detail.free_time", "detail.fingerprint_lock"];
assert.deepEqual(selectedUpdatePatch(parsed.roomPayload, parsed.detailPayload, fields).detail,
  { has_window: true, free_time: true, fingerprint_lock: true });
const pending = { room_payload: { _confirmed_fields: Object.fromEntries(fields.map(field => [field, false])) } };
const reparsed = parseZaloRoomText(source);
assert.deepEqual(preserveConfirmedFields(pending, reparsed), [], "admin values win over auto defaults without another confirmation");
for (const field of fields) assert.equal(reparsed.detailPayload[field.split(".")[1]], false);
const reparsedAgain = parseZaloRoomText(source);
preserveConfirmedFields({ room_payload: reparsed.roomPayload }, reparsedAgain);
for (const field of fields) assert.equal(reparsedAgain.detailPayload[field.split(".")[1]], false, "repeated parsing retains admin's last save");
const auto = parseAutoReadText(source);
assert.equal(auto.sharedDetail.free_time, true);
assert.equal(auto.sharedDetail.fingerprint_lock, true);
console.log("Amenity defaults: balcony implies window, free hours/fingerprint defaults, UPDATE selection, admin false survives repeated parsing, Auto read PASS");
