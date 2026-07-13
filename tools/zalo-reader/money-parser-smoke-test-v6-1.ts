import assert from "node:assert/strict";

import {
  normalizeMoneyToVnd,
  parseZaloRoomText,
} from "../../lib/zalo-import/parser";

assert.equal(
  normalizeMoneyToVnd("3k8"),
  3_800
);

assert.equal(
  normalizeMoneyToVnd("3k80"),
  3_800
);

assert.equal(
  normalizeMoneyToVnd("3k800"),
  3_800
);

assert.equal(
  normalizeMoneyToVnd("3k05"),
  3_050
);

assert.equal(
  normalizeMoneyToVnd("100k"),
  100_000
);

assert.equal(
  normalizeMoneyToVnd("3tr8"),
  3_800_000
);

const sample = `
Cập nhật ngày 10/07
🏘️ Địa chỉ: 139 Tô Hiến Thành, phường 13, quận 10
▪️Điện 3k8/số, nước 100k/người, phí dịch vụ 150k/phòng, free xe
🌹HH 12th, 70%-cọc 1 th
🌹HH 12th, 80% -cọc 1,5th

▶️Phòng 103 -2PN giá 7TR5/tháng
`.trim();

const parsed =
  parseZaloRoomText(
    sample
  );

assert.equal(
  parsed.detailPayload.electric_fee_value,
  3_800,
  JSON.stringify(
    parsed.detailPayload,
    null,
    2
  )
);

assert.equal(
  parsed.detailPayload.water_fee_value,
  100_000
);

assert.equal(
  parsed.detailPayload.service_fee_value,
  150_000
);

assert.equal(
  parsed.roomPayload.price,
  7_500_000
);

console.log(
  "Money Parser V6.1 regression: PASS"
);
console.log(
  "Điện 3k8 -> 3.800đ: PASS"
);
console.log(
  "139 Tô Hiến Thành sample: PASS"
);
