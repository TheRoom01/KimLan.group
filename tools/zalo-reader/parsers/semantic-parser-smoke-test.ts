// @ts-ignore Node built-in type is available in the project runtime.
import assert from "node:assert/strict";

import { buildSemanticTimelineRooms } from "./index";
import type { SemanticIndexedDbMessage } from "./types";

function textMessage(
  id: string,
  text: string,
  timestamp: number
): SemanticIndexedDbMessage {
  return {
    msgId: id,
    cliMsgId: id,
    msgType: 1,
    kind: "text",
    text,
    imageUrls: [],
    groupLayoutId: null,
    imageIndex: null,
    totalImages: null,
    sendDttm: timestamp,
    serverTime: timestamp,
    fromUid: "u1",
    toUid: "g1",
    senderName: "Tester",
    originMsgType: "chat.text",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

function imageMessage(
  id: string,
  albumId: string,
  imageIndex: number,
  totalImages: number,
  timestamp: number
): SemanticIndexedDbMessage {
  return {
    msgId: id,
    cliMsgId: id,
    msgType: 3,
    kind: "image",
    text: "",
    imageUrls: [`https://example.test/${id}.jpg`],
    groupLayoutId: albumId,
    imageIndex,
    totalImages,
    sendDttm: timestamp,
    serverTime: timestamp,
    fromUid: "u1",
    toUid: "g1",
    senderName: "Tester",
    originMsgType: "chat.photo",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

const markerBeforeImages = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "house-1",
      [
        "CẬP NHẬT DỰ ÁN MỚI: 4/3 Đường Số 5, Phường Bàn Cờ, TPHCM",
        "Toà nhà thang máy 3 tầng, 9 phòng",
        "Điện 4k, nước 150k/ng, DV 500k/p",
      ].join("\n"),
      1_000
    ),
    textMessage("room-203", "203 8tr5", 2_000),
    imageMessage("203-a", "album-203", 0, 2, 3_000),
    imageMessage("203-b", "album-203", 1, 2, 3_010),
    textMessage("room-101", "Mã 101 - 9tr", 4_000),
    imageMessage("101-a", "album-101", 0, 2, 5_000),
    imageMessage("101-b", "album-101", 1, 2, 5_010),
  ],
});

assert.equal(markerBeforeImages.length, 2);
assert.deepEqual(
  markerBeforeImages.find((room) => room.markerText.includes("203"))
    ?.imageMessageIds,
  ["203-a", "203-b"]
);
assert.deepEqual(
  markerBeforeImages.find((room) => room.markerText.includes("101"))
    ?.imageMessageIds,
  ["101-a", "101-b"]
);

const imagesBeforeMarker = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "house-2",
      [
        "CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ",
        "31 Ký Hoà Quận 5",
        "Điện: 3k8/kwh",
        "Nước: 100k/người",
      ].join("\n"),
      10_000
    ),
    imageMessage("202-a", "album-202", 0, 2, 11_000),
    imageMessage("202-b", "album-202", 1, 2, 11_010),
    textMessage(
      "room-202",
      "P202 - 4,9 Tr\nThưởng nóng: 750k/6 tháng",
      12_000
    ),
    imageMessage("401-a", "album-401", 0, 2, 13_000),
    imageMessage("401-b", "album-401", 1, 2, 13_010),
    textMessage(
      "room-401",
      "P401 - Ban Công - 5tr\nThưởng nóng: 1tr5/12 tháng",
      14_000
    ),
  ],
});

assert.equal(imagesBeforeMarker.length, 2);
assert.deepEqual(
  imagesBeforeMarker.find((room) => room.markerText.includes("P202"))
    ?.imageMessageIds,
  ["202-a", "202-b"]
);
assert.deepEqual(
  imagesBeforeMarker.find((room) => room.markerText.includes("P401"))
    ?.imageMessageIds,
  ["401-a", "401-b"]
);

const combinedBuildingAndRoom = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "building-a",
      [
        "32Bis Thạch Thi Thanh, P. Tân Định (Q.1)",
        "P. 101 (Studio+BC): 9.000.000đ (Trống sẵn)",
      ].join("\n"),
      20_000
    ),
    imageMessage("101-x", "album-x", 0, 1, 21_000),
    textMessage(
      "building-b",
      [
        "160C Bùi Thị Xuân, P. Bến Thành (Q.1)",
        "P.502 (Gác+CS): 7.000.000đ (trống sẵn)",
      ].join("\n"),
      22_000
    ),
    imageMessage("502-x", "album-y", 0, 1, 23_000),
  ],
});

assert.equal(combinedBuildingAndRoom.length, 2);
assert.deepEqual(
  combinedBuildingAndRoom.find((room) =>
    room.markerText.includes("101")
  )?.imageMessageIds,
  ["101-x"]
);
assert.deepEqual(
  combinedBuildingAndRoom.find((room) =>
    room.markerText.includes("502")
  )?.imageMessageIds,
  ["502-x"]
);

console.log("Semantic parser smoke test: PASS");

/*
 * Regression: form tòa nhà mới bắt đầu bằng "Khai Trương CHDV"
 * và địa chỉ có emoji ở dòng kế tiếp phải mở segment mới.
 * Không được giữ lại form 85/9 Nguyễn Phi Khanh của tòa trước.
 */
const emojiAddressStartsNewBuilding = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "old-building",
      [
        "Quy mô: 3 Tầng, 6 phòng, Thang bộ",
        "Điện 4k, Nước 100k/ng",
        "📌Địa chỉ dự án: 85/9 Nguyễn Phi Khanh - Quận 1",
      ].join("\n"),
      30_000
    ),
    textMessage("old-room", "P201 - 8tr", 31_000),
    imageMessage("old-a", "old-album", 0, 1, 32_000),
    textMessage(
      "new-building",
      [
        "Khai Trương CHDV cao cấp",
        "📌Địa chỉ: 90/88F Nguyễn Đình Chiểu - Quận 1 (địa chỉ mới đường cây điệp tân định)",
        "📌 Tòa nhà thang bộ camera an ninh 24/24",
        "📌 Dạng phòng: studio",
        "+ Điện: 4k/kwh",
        "+ Nước: 100k/người",
        "+ Dịch vụ: 200k/phòng",
      ].join("\n"),
      33_000
    ),
    textMessage("new-room", "P102 - giá 13tr5 - giảm 13tr", 34_000),
    imageMessage("new-a", "new-album", 0, 2, 35_000),
    imageMessage("new-b", "new-album", 1, 2, 35_010),
  ],
});

assert.equal(emojiAddressStartsNewBuilding.length, 2);
const p102 = emojiAddressStartsNewBuilding.find((room) =>
  room.markerText.includes("P102")
);
if (!p102) {
  throw new Error("Không tạo được room P102 trong regression test");
}
assert.match(p102.houseInfoText, /90\/88F Nguyễn Đình Chiểu/i);
assert.doesNotMatch(p102.houseInfoText, /85\/9 Nguyễn Phi Khanh/i);
assert.deepEqual(p102.imageMessageIds, ["new-a", "new-b"]);

console.log("Emoji address building-boundary regression: PASS");

/*
 * Regression V3:
 * - Tiêu đề có tiền tố HIFRIENDZ nhưng không có dấu gạch ngang.
 * - Địa chỉ dùng underscore và F12: 413/8 Lê Văn Sỹ_F12_ Quận 3.
 * - Segment cũ có thể mới chỉ có form tòa nhà, chưa thấy marker/media.
 *   Tiêu đề dự án mạnh vẫn phải mở tòa nhà mới.
 */
const hifriendzUnderscoreAddress = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "stale-building-only",
      [
        "Quy mô: 3 tầng, 6 phòng, thang bộ",
        "Điện 4k, Nước 100k/người",
        "Địa chỉ dự án: 85/9 Nguyễn Phi Khanh - Quận 1",
      ].join("\n"),
      40_000
    ),
    textMessage(
      "q3-header",
      "HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3:",
      41_000
    ),
    textMessage(
      "q3-address",
      "413/8 Lê Văn Sỹ_F12_ Quận 3",
      42_000
    ),
    textMessage(
      "q3-policy",
      [
        "CHI PHÍ: Điện: 4k/Kwh, Nước: 100k/Người, Dịch vụ: 200k/Phòng, Xe: 100k/ xe",
        "- Quy mô: Thang máy",
        "Hợp đồng: 6 tháng - 12 tháng (hoa hồng: 50% - 100%)",
        "Cọc 1 tháng",
        "Nội thất: Giường, nệm, tủ lạnh, tủ đồ, kệ bếp, máy lạnh, máy giặt riêng",
        "Thú cưng: cho nuôi",
        "1/8 trống",
      ].join("\n"),
      43_000
    ),
    textMessage("q3-room", "403 8tr8 38m2", 44_000),
    imageMessage("q3-a", "q3-album", 0, 2, 45_000),
    imageMessage("q3-b", "q3-album", 1, 2, 45_010),
  ],
});

const room403 = hifriendzUnderscoreAddress.find((room) =>
  room.markerText.includes("403")
);
if (!room403) {
  throw new Error("Không tạo được room 403 trong regression test");
}
assert.match(room403.houseInfoText, /413\/8 Lê Văn Sỹ_F12_ Quận 3/i);
assert.doesNotMatch(room403.houseInfoText, /85\/9 Nguyễn Phi Khanh/i);
assert.deepEqual(room403.imageMessageIds, ["q3-a", "q3-b"]);

console.log("HIFRIENDZ underscore-address regression: PASS");

/*
 * Regression V4:
 * Một tòa nhà có hai marker kiểu "Trống mã ..." và hai album
 * đều nằm trước marker tương ứng. Parser phải tạo hai record,
 * không tạo synthetic room chứa toàn bộ 11 ảnh.
 */
const multipleVacantRoomMarkers = buildSemanticTimelineRooms({
  groupName: "TEST",
  groupId: "g1",
  messages: [
    textMessage(
      "building-1186",
      [
        "CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ",
        "1186 Võ Văn Kiệt Quận 5",
        "Quy mô: thang máy",
        "-Điện: 4k/kwh",
        "-Nước: 100k/ng",
        "-Xe: 150k/xe số, 200k/xe tay ga",
        "-Phí dịch vụ: 100k/người",
        "Cọc: 1 tháng (HĐ 6-12 tháng)",
      ].join("\n"),
      50_000
    ),
    imageMessage("902-a", "album-902", 0, 2, 51_000),
    imageMessage("902-b", "album-902", 1, 2, 51_010),
    textMessage("room-902", "Trống mã 902 giá 4tr8", 52_000),
    imageMessage("503-a", "album-503", 0, 3, 53_000),
    imageMessage("503-b", "album-503", 1, 3, 53_010),
    imageMessage("503-c", "album-503", 2, 3, 53_020),
    textMessage(
      "room-503-803",
      "Trống mã 503 + 803 giá 6tr",
      54_000
    ),
  ],
});

assert.equal(multipleVacantRoomMarkers.length, 2);
const room902 = multipleVacantRoomMarkers.find((room) =>
  room.markerText.includes("902")
);
const room503 = multipleVacantRoomMarkers.find((room) =>
  room.markerText.includes("503 + 803")
);
if (!room902 || !room503) {
  throw new Error(
    "Không tách được hai marker Trống mã 902 và Trống mã 503 + 803"
  );
}
assert.deepEqual(room902.imageMessageIds, ["902-a", "902-b"]);
assert.deepEqual(room503.imageMessageIds, [
  "503-a",
  "503-b",
  "503-c",
]);
assert.equal(room902.markerText, "Trống mã 902 giá 4tr8");
assert.equal(room503.markerText, "Trống mã 503 + 803 giá 6tr");

console.log("Multiple vacant-room markers regression: PASS");

/*
 * ========================================================
 * GIAI ĐOẠN 2 BẢN CHỐT
 * ========================================================
 */
const finalAlternatingMarkers = buildSemanticTimelineRooms({
  groupName: "TEST-PHASE-2-FINAL",
  groupId: "g1",
  messages: [
    textMessage(
      "final-building-1",
      "20 Nguyễn Cư Trinh Quận 1\nTòa nhà thang máy",
      60_000
    ),
    textMessage(
      "final-room-402",
      "Lầu trên cùng p402 - 8tr",
      61_000
    ),
    imageMessage(
      "final-402-a",
      "final-album-402",
      0,
      1,
      62_000
    ),
    textMessage(
      "final-room-701",
      "701 2PN 17tr",
      63_000
    ),
    imageMessage(
      "final-701-a",
      "final-album-701",
      0,
      1,
      64_000
    ),
    textMessage(
      "final-room-601-501",
      "601 501 2PN 15tr",
      65_000
    ),
    imageMessage(
      "final-601-501-a",
      "final-album-601-501",
      0,
      1,
      66_000
    ),
    textMessage(
      "final-room-204",
      "Trống sẵn 204 : 5.800.000\nChốt Giảm : 5.500.000",
      67_000
    ),
    imageMessage(
      "final-204-a",
      "final-album-204",
      0,
      1,
      68_000
    ),
  ],
});

assert.equal(finalAlternatingMarkers.length, 4);
assert.deepEqual(
  finalAlternatingMarkers.find((room) =>
    room.markerText.includes("p402")
  )?.imageMessageIds,
  ["final-402-a"]
);
assert.deepEqual(
  finalAlternatingMarkers.find((room) =>
    room.markerText.includes("701 2PN")
  )?.imageMessageIds,
  ["final-701-a"]
);
assert.deepEqual(
  finalAlternatingMarkers.find((room) =>
    room.markerText.includes("601 501")
  )?.imageMessageIds,
  ["final-601-501-a"]
);
assert.deepEqual(
  finalAlternatingMarkers.find((room) =>
    room.markerText.includes("Trống sẵn 204")
  )?.imageMessageIds,
  ["final-204-a"]
);

const finalRoomForm = buildSemanticTimelineRooms({
  groupName: "TEST-PHASE-2-FINAL",
  groupId: "g1",
  messages: [
    textMessage(
      "final-room-form",
      [
        "‼️FORM XÁC NHẬN NHƯỢNG CỌC‼️",
        "Địa chỉ dự án: 8/3 Hồ Hảo Hớn Quận 1",
        "Mã phòng:",
        "Giá phòng: 16.500.000",
        "Số tiền cọc: 24.750.000",
        "Phí nhượng: 50% giá phòng",
        "Hạn check in: 31/7",
        "HĐ còn lại: 9 tháng",
      ].join("\n"),
      70_000
    ),
    imageMessage(
      "final-form-a",
      "final-form-album",
      0,
      1,
      71_000
    ),
  ],
});

assert.equal(finalRoomForm.length, 1);
assert.match(
  finalRoomForm[0].markerText,
  /Giá phòng: 16\.500\.000/i
);
assert.deepEqual(
  finalRoomForm[0].imageMessageIds,
  ["final-form-a"]
);
assert.ok(
  finalRoomForm[0].warnings.includes("ROOM_CODE_MISSING")
);

/*
 * Cùng groupLayoutId nhưng có marker chữ xen giữa:
 * album phải đóng ngay và ảnh sau text thuộc phòng tiếp theo.
 */
const finalTextBreaksAlbum = buildSemanticTimelineRooms({
  groupName: "TEST-PHASE-2-FINAL",
  groupId: "g1",
  messages: [
    textMessage(
      "final-building-2",
      "22 Nguyễn Cư Trinh Quận 1\nTòa nhà thang máy",
      80_000
    ),
    textMessage(
      "final-room-201",
      "P201 - 6tr",
      81_000
    ),
    imageMessage(
      "final-shared-a",
      "same-layout-id",
      0,
      2,
      82_000
    ),
    textMessage(
      "final-room-202",
      "P202 - 6tr5",
      83_000
    ),
    imageMessage(
      "final-shared-b",
      "same-layout-id",
      1,
      2,
      84_000
    ),
  ],
});

assert.deepEqual(
  finalTextBreaksAlbum.find((room) =>
    room.markerText.includes("P201")
  )?.imageMessageIds,
  ["final-shared-a"]
);
assert.deepEqual(
  finalTextBreaksAlbum.find((room) =>
    room.markerText.includes("P202")
  )?.imageMessageIds,
  ["final-shared-b"]
);

const finalBatchMarkersThenAlbums =
  buildSemanticTimelineRooms({
    groupName: "TEST-PHASE-2-FINAL",
    groupId: "g1",
    messages: [
      textMessage(
        "final-building-3",
        "24 Nguyễn Cư Trinh Quận 1\nTòa nhà thang máy",
        90_000
      ),
      textMessage(
        "final-batch-301",
        "301 - 5tr",
        91_000
      ),
      textMessage(
        "final-batch-302",
        "302 - 5tr5",
        92_000
      ),
      textMessage(
        "final-batch-303",
        "303 - 6tr",
        93_000
      ),
      imageMessage(
        "final-batch-301-a",
        "final-batch-album-301",
        0,
        1,
        94_000
      ),
      imageMessage(
        "final-batch-302-a",
        "final-batch-album-302",
        0,
        1,
        95_000
      ),
      imageMessage(
        "final-batch-303-a",
        "final-batch-album-303",
        0,
        1,
        96_000
      ),
    ],
  });

assert.deepEqual(
  finalBatchMarkersThenAlbums.find((room) =>
    room.markerText.includes("301")
  )?.imageMessageIds,
  ["final-batch-301-a"]
);
assert.deepEqual(
  finalBatchMarkersThenAlbums.find((room) =>
    room.markerText.includes("302")
  )?.imageMessageIds,
  ["final-batch-302-a"]
);
assert.deepEqual(
  finalBatchMarkersThenAlbums.find((room) =>
    room.markerText.includes("303")
  )?.imageMessageIds,
  ["final-batch-303-a"]
);

console.log("Phase 2 final marker-album regression: PASS");
