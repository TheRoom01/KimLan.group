import assert from "node:assert/strict";
import { extractAddressKey } from "./parsers/utils";

import {
  detectZaloBuildingCandidates,
  parseZaloRoomText,
} from "../../lib/zalo-import/parser";

const thaiVanLungText = `8A/A18A Thái Văn Lung, Bến Nghé, Q1
- Phí điện: 4.000/Kwh
- Phí nước: 100k/ng
- Phí xe: gửi ngoài
- Thang: bộ
- Có máy giặt riêng

1PN/CS - 8.200.000 - P.201 - trống
Mã phòng: P.201`;

for (const text of [thaiVanLungText, `- Phí dịch vụ: 200k/p\n${thaiVanLungText}`]) {
  const { roomPayload } = parseZaloRoomText(text);
  assert.equal(roomPayload.house_number, "8A/A18A");
  assert.equal(roomPayload.address, "Thái Văn Lung");
  assert.equal(roomPayload.ward, "Bến Nghé");
  assert.equal(roomPayload.district, "Quận 1");
  assert.equal(roomPayload.room_code, "201");
  assert.equal(roomPayload.price, 8_200_000);

  const candidates = detectZaloBuildingCandidates(text);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].houseNumber, "8A/A18A");
  assert.equal(candidates[0].address, "Thái Văn Lung");
  assert.match(extractAddressKey(text), /^8a\/a18a\b/);
}

const nguyenTraiText = `
DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
Điện 4k/kWh
Nước 100k/ng
HH 50-80%
Free phí ql, free xe

Trống phòng L2 mặt sau giá 3tr (không máy lạnh)

Dắt khách liên hệ : 090 2552293
Ưu tiên sinh viên, không nhận xe điện
Nhận tối đa 2 bạn
`.trim();

const parsedNguyenTrai =
  parseZaloRoomText(
    nguyenTraiText
  );

assert.equal(
  parsedNguyenTrai.roomPayload.house_number,
  "517/18",
  JSON.stringify(
    parsedNguyenTrai.roomPayload,
    null,
    2
  )
);

assert.equal(
  parsedNguyenTrai.roomPayload.address,
  "Nguyễn Trãi"
);

assert.equal(
  parsedNguyenTrai.roomPayload.ward,
  "An Đông"
);

assert.equal(
  parsedNguyenTrai.roomPayload.district,
  "Quận 5"
);

assert.equal(
  parsedNguyenTrai.roomPayload.room_code,
  "L2"
);

assert.equal(
  parsedNguyenTrai.roomPayload.price,
  3_000_000
);

const inlineHifriendzText = `
HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3: 413/8 Lê Văn Sỹ, P12, Quận 3
Trống phòng 403 giá 8tr8
`.trim();

const parsedHifriendz =
  parseZaloRoomText(
    inlineHifriendzText
  );

assert.equal(
  parsedHifriendz.roomPayload.house_number,
  "413/8"
);

assert.equal(
  parsedHifriendz.roomPayload.address,
  "Lê Văn Sỹ"
);

const candidates =
  detectZaloBuildingCandidates(
    nguyenTraiText
  );

assert.ok(
  candidates.some(
    (candidate) =>
      candidate.houseNumber ===
        "517/18" &&
      candidate.address ===
        "Nguyễn Trãi"
  ),
  JSON.stringify(
    candidates,
    null,
    2
  )
);

console.log(
  "Address Parser V5 regression: PASS"
);
console.log(
  "517/18 Nguyễn Trãi extraction: PASS"
);
console.log(
  "Inline HIFRIENDZ project address: PASS"
);
