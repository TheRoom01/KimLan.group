import assert from "node:assert/strict";

import {
  detectZaloBuildingCandidates,
  parseZaloRoomText,
} from "../../lib/zalo-import/parser";

const nguyenTraiText = `
DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
Điện 4k/kWh
Nước 100k/ng
🌹HH 50-80%
Free phí ql, free xe

Trống phòng L2 mặt sau giá 3tr (không máy lạnh)

Dắt khách liên hệ : 090 2552293

Ưu tiên sinh viên, không nhận xe điện

Nhận tối đa 2 bạn
`.trim();

const parsed =
  parseZaloRoomText(
    nguyenTraiText
  );

assert.equal(
  parsed.roomPayload.house_number,
  "517/18",
  JSON.stringify(
    parsed.roomPayload,
    null,
    2
  )
);

assert.equal(
  parsed.roomPayload.address,
  "Nguyễn Trãi"
);

assert.equal(
  parsed.roomPayload.ward,
  "An Đông"
);

assert.equal(
  parsed.roomPayload.district,
  "Quận 5"
);

assert.equal(
  parsed.roomPayload.room_code,
  "L2"
);

assert.equal(
  parsed.roomPayload.price,
  3_000_000
);

const hifriendzInline = `
HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3: 413/8 Lê Văn Sỹ, P12, Quận 3
Trống phòng 403 giá 8tr8
`.trim();

const parsedHifriendz =
  parseZaloRoomText(
    hifriendzInline
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
  "Address Parser V5.1 regression: PASS"
);
console.log(
  "517/18 Nguyễn Trãi extraction: PASS"
);
console.log(
  "Inline HIFRIENDZ project address: PASS"
);
