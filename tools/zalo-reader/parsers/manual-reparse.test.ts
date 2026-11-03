import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseZaloRoomText, detectZaloBuildingCandidates } from "../../../lib/zalo-import/parser";
import { preserveConfirmedFields } from "../../../lib/zalo-import/reparse-review";

const address = "158/4 - 6 Hoàng Hoa Thám, Tân Bình";
const listing = "Studio/BC - 10.000.000 - P.103 + P.203 + P.403 - trống sẵn";
const buildingWithFees = `${address}\n- Phí điện: 4.200/Kwh\n- Phí nước: 200k/ng\n- Phí xe: free\n- Thang: máy\n- Có máy giặt riêng\nNhanh tay chốt phòng cọc và in trước 11/11 thưởng sale 500k nhé @All`;
for (const separator of ["\n", "\n\n"]) {
  const source = `${buildingWithFees}${separator}Studio/BC - 13.000.000 - P.102 - trống sẵn\nMã phòng: P.102`;
  for (const options of [{}, { targetRoomCode: "102" }]) {
    const result = parseZaloRoomText(source, options);
    assert.equal(result.roomPayload.description, "", "building fields must not become description");
    assert.equal(result.detailPayload.electric_fee_value, 4200);
    assert.equal(result.detailPayload.water_fee_value, 200000);
    assert.equal(result.detailPayload.has_balcony, true);
  }
}
for (const status of ["trống sẵn", "trống 5/11", "trong 5/11/2026", "đã thuê"]) {
  const result = parseZaloRoomText(`${buildingWithFees}\nStudio/BC - 13.000.000 - P.102 - ${status} - Phòng thoáng, view đẹp\nGần công viên\nMã phòng: P.102`);
  assert.equal(result.roomPayload.description, "Phòng thoáng, view đẹp\nGần công viên", status);
}
assert.equal(parseZaloRoomText(`${buildingWithFees}\nStudio - 13.000.000 - P.102 - View đẹp\nMã phòng: P.102`).roomPayload.description, "View đẹp");
assert.equal(parseZaloRoomText(`${buildingWithFees}\nStudio - 13.000.000 - P.102 - trống sẵn\nPhòng rộng, view đẹp\nMã phòng: P.102`).roomPayload.description, "Phòng rộng, view đẹp");
assert.equal(detectZaloBuildingCandidates(`${address}\n123 Lê Văn Sỹ, Phú Nhuận`).length, 2);
for (const text of [
  `${address}\n\n${listing}\n\nMã phòng: P.403`,
  `${address}\n${listing}\nMã phòng P.403`,
  `${listing}\n${address}\nMã phòng: P.403`,
]) {
  const { roomPayload: room, detailPayload: detail } = parseZaloRoomText(text);
  for (const [field, value] of Object.entries({ house_number: "158/4 - 6", address: "Hoàng Hoa Thám", district: "Tân Bình", room_code: "403", room_type: "Studio", price: 10000000, status: "Đang trống", ward: "" })) assert.equal(room[field], value, field);
  assert.equal(detail.has_balcony, true);
  assert.ok(room._parse_review.evidence.address.text.includes(address));
}
for (const house of ["158A/4B - 6C", "158/4-6", "158/4 - 6"]) {
  const parsed = parseZaloRoomText(`${house} Hoàng Hoa Thám, Phường 12, Tân Bình\n${listing}\nMã phòng: P.403`);
  assert.equal(parsed.roomPayload.house_number, house);
  assert.equal(parsed.roomPayload.ward, "12");
}
const scoped = parseZaloRoomText(`${address}\nP.103 Studio 5tr đã thuê\nP.403 Duplex 10tr trống sẵn\nMã phòng P.403`, { targetRoomCode: "403" });
assert.equal(scoped.roomPayload.room_code, "403");
assert.equal(scoped.roomPayload.price, 10000000);
assert.equal(scoped.roomPayload.room_type, "Duplex");
assert.equal(scoped.roomPayload.status, "Đang trống");
assert.equal(scoped.roomPayload.ward, "");
for (const text of ["P.403 - Studio - 10tr - trống", "3 tầng, giá 10 triệu\nMã phòng: P.403"]) {
  const parsed = parseZaloRoomText(text);
  assert.equal(parsed.roomPayload.house_number, "");
  assert.ok(parsed.roomPayload._parse_review.missing.includes("house_number"));
}
const pending = { room_payload: { _confirmed_fields: { "room.price": 9000000, "detail.has_window": false } } };
const fresh = () => parseZaloRoomText(`${address}\n${listing}\nMã phòng P.403`);
const parsed = fresh();
assert.equal(preserveConfirmedFields(pending, parsed).length, 1);
assert.equal(parsed.roomPayload.price, 9000000);
assert.equal(preserveConfirmedFields(pending, fresh(), { "room.price": "source", "detail.has_window": "keep" }).length, 0);
const route = readFileSync("app/api/admin/zalo-imports/[id]/reparse/route.ts", "utf8");
assert.ok(route.includes("skipInheritance: true"));
assert.ok(!route.includes("updateBatchError"));
assert.ok(!route.includes("publishPendingRoom("));
assert.ok(route.includes('.eq("draft_revision"'));
console.log("manual-reparse regression passed");
