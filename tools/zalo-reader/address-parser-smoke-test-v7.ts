import assert from "node:assert/strict";

import {
  detectZaloBuildingCandidates,
  parseZaloRoomText,
} from "../../lib/zalo-import/parser";

const sample = `
HIFRIENDZ - THÔNG BÁO DỰ ÁN ĐỘC QUYỀN MỚI
- Địa chỉ dự án: B19/6 Cư Xá Phú Lâm B. Q6
Điện : 4k/kwh
Nước : 100k/ng
Dịch vụ : 150k/phòng
Xe : 100k/chiếc
📌Chính sách cọc và thanh toán tiền nhà
+ Cọc 1 tháng
+ Cọc tối thiểu 50% giữ 3 ngày. cọc đủ giữ được 7 ngày
📌Huỷ cọc chia đôi 50-50 giữa sale và chủ nhà trừ các ngày giữ phòng
Dẫn khách liên hệ
- Kết cấu toà nhà: - 4 tầng - tổng 15 phòng - thang máy
- Số phòng + mã phòng trống : 14
- Cho nuôi thú cưng hay không: chỉ nuôi mèo, cấm nuôi chó
- Không nhận xe điện
🌹12 tháng 75%
Nhà xe thang máy - Nhà mới

Mã 01 giá 5tr7 (máy giặt riêng)
`.trim();

const parsed =
  parseZaloRoomText(
    sample
  );

assert.equal(
  parsed.roomPayload.house_number,
  "B19/6",
  JSON.stringify(
    parsed.roomPayload,
    null,
    2
  )
);

assert.equal(
  parsed.roomPayload.address,
  "Cư Xá Phú Lâm B."
);

assert.equal(
  parsed.roomPayload.district,
  "Quận 6"
);

assert.equal(
  parsed.roomPayload.room_code,
  "01"
);

assert.equal(
  parsed.roomPayload.price,
  5_700_000
);

const candidates =
  detectZaloBuildingCandidates(
    sample
  );

assert.ok(
  candidates.some(
    (candidate) =>
      candidate.houseNumber ===
        "B19/6" &&
      candidate.address ===
        "Cư Xá Phú Lâm B."
  ),
  JSON.stringify(
    candidates,
    null,
    2
  )
);

/*
 * Regression: số nhà bắt đầu bằng số vẫn phải hoạt động.
 */
const numericSample = `
DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
Trống phòng L2 giá 3tr
`.trim();

const numericParsed =
  parseZaloRoomText(
    numericSample
  );

assert.equal(
  numericParsed.roomPayload.house_number,
  "517/18"
);

assert.equal(
  numericParsed.roomPayload.address,
  "Nguyễn Trãi"
);

console.log(
  "Address Parser V7 regression: PASS"
);
console.log(
  "B19/6 Cư Xá Phú Lâm B. extraction: PASS"
);
console.log(
  "Numeric house-number regression: PASS"
);
