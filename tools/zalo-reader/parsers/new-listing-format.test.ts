// @ts-ignore Node built-in type is available in the project runtime.
import assert from "node:assert/strict";

import {
  normalizeMoneyToVnd,
  parseZaloRoomText,
} from "../../../lib/zalo-import/parser";
import { buildSemanticTimelineRooms } from "./index";
import type { SemanticIndexedDbMessage } from "./types";

type Check = {
  name: string;
  run: () => void;
};

const checks: Check[] = [];

function check(name: string, run: () => void) {
  checks.push({ name, run });
}

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
    fromUid: "fake-sender",
    toUid: "fake-group",
    senderName: "Test Fixture",
    originMsgType: "chat.text",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

function imageMessage(
  id: string,
  albumId: string,
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
    imageIndex: 0,
    totalImages: 1,
    sendDttm: timestamp,
    serverTime: timestamp,
    fromUid: "fake-sender",
    toUid: "fake-group",
    senderName: "Test Fixture",
    originMsgType: "chat.photo",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

function semantic(messages: SemanticIndexedDbMessage[]) {
  return buildSemanticTimelineRooms({
    groupName: "FIXTURE GROUP",
    groupId: "fake-group",
    messages,
    parserOptions: {
      mediaBias: "after",
      buildingBoundary: "address-or-separator",
      splitBySender: false,
      allowMediaOnly: false,
      allowTextOnly: true,
      maxMediaGapMs: 30 * 60 * 1000,
      boundaryGapMs: 45 * 60 * 1000,
    },
  });
}

function listing(
  roomLine: string,
  building = "391/146 Trần Hưng Đạo, Q1"
) {
  return parseZaloRoomText(`${building}\n\n${roomLine}`);
}

check("một dự án một phòng: trích xuất loại, mã, giá và trạng thái", () => {
  const parsed = listing("Studio/BC - 6.900.000 - P.103 - trống sẵn");
  assert.equal(parsed.roomPayload.room_type, "Studio");
  assert.equal(parsed.roomPayload.room_code, "103");
  assert.equal(parsed.roomPayload.price, 6_900_000);
  assert.equal(parsed.roomPayload.status, "Trống");
});

check("ba dòng phòng riêng được giữ thành ba preview với album tương ứng", () => {
  const previews = semantic([
    textMessage(
      "building",
      "391/146 Trần Hưng Đạo, Q1\nPhí điện: 4.000/kwh",
      1_000
    ),
    textMessage("room-103", "Studio/BC - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("photo-103", "album-103", 3_000),
    textMessage("room-502", "Studio/CS - 6.300.000 - P.502 - trống sẵn", 4_000),
    imageMessage("photo-502", "album-502", 5_000),
    textMessage("room-401", "Studio/BC - 9.500.000 - P.401 - trống sẵn", 6_000),
    imageMessage("photo-401", "album-401", 7_000),
  ]);

  assert.equal(previews.length, 3);
  const byMarker = (code: string) =>
    previews.find((preview) => preview.markerText.includes(code));
  assert.deepEqual(byMarker("103")?.imageMessageIds, ["photo-103"]);
  assert.deepEqual(byMarker("502")?.imageMessageIds, ["photo-502"]);
  assert.deepEqual(byMarker("401")?.imageMessageIds, ["photo-401"]);
});

check("một dòng có hai mã cùng giá tạo hai payload phòng với mã riêng", () => {
  const previews = semantic([
    textMessage("building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage(
      "rooms",
      "Studio/CS - 6.900.000 - P.G01 + P.102 - trống sẵn",
      2_000
    ),
    imageMessage("shared-photo", "shared-album", 3_000),
  ]);

  assert.equal(previews.length, 2);
  const parsedCodes = previews
    .map((preview) => listing(preview.fullText).roomPayload.room_code)
    .sort();
  assert.deepEqual(parsedCodes, ["102", "G01"]);
});

check("một album có thể được gán cho nhiều mã phòng cùng nội dung tin", () => {
  const previews = semantic([
    textMessage("building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage(
      "rooms",
      "Studio/CS - 6.900.000 - P.G01 + P.102 - trống sẵn",
      2_000
    ),
    imageMessage("shared-photo", "shared-album", 3_000),
  ]);

  assert.equal(previews.length, 2);
  assert.deepEqual(
    previews.map((preview) => preview.imageMessageIds),
    [["shared-photo"], ["shared-photo"]]
  );
});

check("nhiều mức giá trên các dòng riêng giữ giá và mã tương ứng", () => {
  const previews = semantic([
    textMessage("building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("room-101", "Studio/BC - 8.500.000 - P.101 - trống sẵn", 2_000),
    textMessage("room-501", "Studio/BC - 9.000.000 - P.501 - trống sẵn", 3_000),
    imageMessage("shared-set", "reference-album", 4_000),
  ]);

  assert.equal(previews.length, 2);
  const parsed = previews.map((preview) => {
    const payload = listing(preview.fullText).roomPayload;
    return { code: payload.room_code, price: payload.price };
  }).sort((a, b) => Number(a.price) - Number(b.price));
  assert.deepEqual(parsed, [
    { code: "101", price: 8_500_000 },
    { code: "501", price: 9_000_000 },
  ]);
});

check("một bộ ảnh tham khảo dùng chung cho các phòng khác mã và khác giá", () => {
  const previews = semantic([
    textMessage("building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("room-502", "Studio/CS - 6.300.000 - P.502 - trống sẵn", 2_000),
    textMessage(
      "room-g01-102",
      "Studio/CS - 6.900.000 - P.G01 + P.102 - trống sẵn",
      3_000
    ),
    imageMessage("reference-photo", "reference-album", 4_000),
  ]);

  assert.equal(previews.length, 3);
  assert.ok(
    previews.every((preview) =>
      preview.imageMessageIds.includes("reference-photo")
    )
  );
});

check("CS nhận diện thành Cửa sổ, không trở thành loại phòng", () => {
  const windowRoom = listing("Studio/CS - 6.300.000 - P.502 - trống sẵn");
  assert.equal(windowRoom.roomPayload.room_type, "Studio");
  assert.match(windowRoom.detailPayload.other_amenities, /cửa sổ/i);
});

check("BC nhận diện thành Ban công, không trở thành loại phòng", () => {
  const balconyRoom = listing("Studio/BC - 6.900.000 - P.103 - trống sẵn");
  assert.equal(balconyRoom.roomPayload.room_type, "Studio");
  assert.match(balconyRoom.detailPayload.other_amenities, /ban công/i);
});

check("1PK và 1PB không làm thay đổi taxonomy loại phòng", () => {
  assert.equal(listing("1PN/BC/1PB - 10.000.000 - P.201 - trống sẵn").roomPayload.room_type, "1PN");
  assert.equal(listing("1PN/CS/1PK - 13.000.000 - P.301 - trống sẵn").roomPayload.room_type, "1PN");
});

check("Lầu 1 + Lầu 2 tạo hai phòng với cùng giá", () => {
  const previews = semantic([
    textMessage("building-floor", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("floor-rooms", "Studio/CS - 11.000.000 - Lầu 1 + Lầu 2 - trống sẵn", 2_000),
    imageMessage("floor-photo", "floor-album", 3_000),
  ]);
  assert.equal(previews.length, 2);
  const parsed = previews.map((preview) => {
    const room = listing(preview.fullText).roomPayload;
    return { code: room.room_code, price: room.price };
  }).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  assert.deepEqual(parsed, [
    { code: "Lầu 1", price: 11_000_000 },
    { code: "Lầu 2", price: 11_000_000 },
  ]);
});

check("Lầu 1, Lầu 2 và Trệt có thể là mã phòng độc lập", () => {
  for (const [id, code, timestamp] of [
    ["floor-one", "Lầu 1", 1_000],
    ["floor-two", "Lầu 2", 2_000],
    ["ground", "Trệt", 3_000],
  ] as const) {
    const previews = semantic([
      textMessage(`${id}-building`, "391/146 Trần Hưng Đạo, Q1", timestamp),
      textMessage(id, `Studio/CS - 11.000.000 - ${code} - trống sẵn`, timestamp + 1),
      imageMessage(`${id}-photo`, `${id}-album`, timestamp + 2),
    ]);
    assert.equal(previews.length, 1, id);
    assert.equal(listing(previews[0].fullText).roomPayload.room_code, code, id);
  }
});

check("P04 + Lầu 2 là một mã chuẩn hóa duy nhất", () => {
  const preview = semantic([
    textMessage("composite-building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("composite-room", "Studio/BC - 9.000.000 - P04 - Lầu 2 - trống sẵn", 2_000),
    imageMessage("composite-photo", "composite-album", 3_000),
  ])[0];
  assert.ok(preview);
  assert.equal(preview.roomCode, "P04 _ Lầu 2");
  assert.equal(listing(preview.fullText).roomPayload.room_code, "P04 _ Lầu 2");
});

check("chuẩn hóa các định dạng giá được yêu cầu và từ chối chuỗi không phải giá", () => {
  for (const [raw, expected] of [
    ["6.900.000", 6_900_000],
    ["6tr9", 6_900_000],
    ["6.9tr", 6_900_000],
    ["6900k", 6_900_000],
  ] as const) {
    assert.equal(normalizeMoneyToVnd(raw), expected, raw);
  }
  assert.equal(normalizeMoneyToVnd("giá thỏa thuận"), null);
});

check("phí dịch vụ free được phân biệt với thiếu phí", () => {
  const parsed = parseZaloRoomText(
    [
      "391/146 Trần Hưng Đạo, Q1",
      "Phí điện: 4.000/kwh",
      "Phí nước: 150k/ng",
      "Phí dịch vụ: free",
      "",
      "Studio/BC - 6.900.000 - P.103 - trống sẵn",
    ].join("\n")
  );

  assert.equal(parsed.detailPayload.electric_fee_value, 4_000);
  assert.equal(parsed.detailPayload.water_fee_value, 150_000);
  assert.ok(
    parsed.detailPayload.service_fee_value === 0 ||
      /free|miễn phí/i.test(String(parsed.detailPayload.other_fee_note || "")),
    "phí dịch vụ free cần được biểu diễn rõ, không để như dữ liệu thiếu"
  );
});

check("phí xe gửi ngoài giữ nguyên ý nghĩa văn bản", () => {
  const parsed = parseZaloRoomText(
    [
      "391/146 Trần Hưng Đạo, Q1",
      "Phí xe: gửi ngoài",
      "",
      "Studio/BC - 6.900.000 - P.103 - trống sẵn",
    ].join("\n")
  );
  assert.match(
    `${parsed.detailPayload.other_fee_note || ""} ${parsed.detailPayload.other_amenities || ""}`,
    /gửi ngoài/i
  );
});

check("không tự chọn năm cho ngày trống chỉ có ngày/tháng", () => {
  const parsed = listing("Studio/BC - 6.900.000 - P.103 - trống 1/11");
  assert.equal(parsed.roomPayload.available_from, undefined);
});

check("không tự gán trạng thái phòng khi tin không nêu", () => {
  const parsed = listing("Studio - 6.900.000 - P.103");
  assert.equal(parsed.roomPayload.status, null);
});

check("không tự gán tiện ích hoặc kỳ thuê mặc định khi tin không nêu", () => {
  const parsed = listing("Studio - 6.900.000 - P.103");
  assert.equal(parsed.detailPayload.shared_washer, null);
  assert.equal(parsed.detailPayload.long_term, null);
});

check("hai dự án có địa chỉ khác nhau không bị gộp; dấu phân cách không bắt buộc", () => {
  const previews = semantic([
    textMessage("building-a", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("room-a", "Studio - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("photo-a", "album-a", 3_000),
    textMessage("separator", "--//--", 4_000),
    textMessage("building-b", "25 Nguyễn Văn Cừ, Q5", 5_000),
    textMessage("room-b", "Studio - 7.500.000 - P.201 - trống sẵn", 6_000),
    imageMessage("photo-b", "album-b", 7_000),
  ]);

  assert.equal(previews.length, 2);
  assert.deepEqual(
    previews
      .map((preview) => preview.imageMessageIds[0])
      .sort(),
    ["photo-a", "photo-b"]
  );
});

check("hash semantic ổn định khi xử lý lại cùng dữ liệu, không tạo preview mới", () => {
  const messages = [
    textMessage("building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("room", "Studio - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("photo", "album", 3_000),
  ];

  const first = semantic(messages);
  const second = semantic(messages);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].sourceHash, second[0].sourceHash);
});

check("tin thiếu hoặc ranh giới chưa rõ được cảnh báo thay vì tự tạo mã phòng", () => {
  const previews = semantic([
    textMessage("ambiguous", "KHAI TRƯƠNG NHÀ MỚI Q1\nStudio, giá thương lượng", 1_000),
    imageMessage("photo", "album", 2_000),
  ]);

  assert.equal(previews.length, 1, "media mơ hồ được đưa vào review");
  assert.ok(previews[0].warnings.includes("ROOM_CODE_MISSING"));
  assert.ok(previews[0].warnings.includes("NO_ROOM_MARKER"));
});

check("địa chỉ, giá và trạng thái không bị nhận nhầm thành mã phòng", () => {
  const previews = semantic([
    textMessage("boundary-building", "391/146 Trần Hưng Đạo, Q1", 1_000),
    textMessage("boundary-room", "Studio - 6.900.000 - trống sẵn", 2_000),
    imageMessage("boundary-photo", "boundary-album", 3_000),
  ]);

  assert.equal(previews.length, 1);
  assert.equal(previews[0].roomCode, "");
  assert.ok(previews[0].warnings.includes("ROOM_CODE_MISSING"));
});

let failed = 0;
for (const { name, run } of checks) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

console.log(`New listing format tests: ${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exitCode = 1;
