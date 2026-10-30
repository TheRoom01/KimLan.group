// @ts-ignore Node built-in type is available in the project runtime.
import assert from "node:assert/strict";

import { parseZaloRoomText } from "../../../lib/zalo-import/parser";
import { evaluateZaloImportQuality } from "../../../lib/zalo-import/quality";
import { resolveZaloImportRoom } from "../../../lib/zalo-import/resolve";
import { buildSemanticTimelineRooms } from "./index";
import type { SemanticIndexedDbMessage, SemanticRoomPreview } from "./types";

type Check = {
  name: string;
  run: () => void | Promise<void>;
};

const checks: Check[] = [];

function check(name: string, run: Check["run"]) {
  checks.push({ name, run });
}

function textMessage(id: string, text: string, timestamp: number): SemanticIndexedDbMessage {
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
    fromUid: "fixture-sender",
    toUid: "fixture-group",
    senderName: "Integration fixture",
    originMsgType: "chat.text",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

function imageMessage(
  id: string,
  albumId: string,
  timestamp: number,
  expectedCount = 1
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
    totalImages: expectedCount,
    sendDttm: timestamp,
    serverTime: timestamp,
    fromUid: "fixture-sender",
    toUid: "fixture-group",
    senderName: "Integration fixture",
    originMsgType: "chat.photo",
    videoUrls: [],
    videoThumbUrls: [],
  };
}

function semantic(messages: SemanticIndexedDbMessage[]) {
  return buildSemanticTimelineRooms({
    groupName: "FIXTURE GROUP",
    groupId: "fixture-group",
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

function roomLookup(candidates: Record<string, unknown>[] = []) {
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: candidates, error: null }); },
  };

  return {
    from() { return query; },
  };
}

function emptyRoomLookup() {
  return roomLookup();
}

const safeSettings = {
  enabled: false,
  dryRun: true,
  minScore: 95,
  minImages: 0,
  allowedGroups: [],
  allowedGroup: false,
  ownerId: "",
};

async function throughStagingBoundary(
  preview: SemanticRoomPreview,
  media: { expected: number; imported: number },
  issues: Array<{ level: string; stage: string; message: string }> = []
) {
  const parsed = parseZaloRoomText(preview.fullText);
  const resolved = await resolveZaloImportRoom({
    // This fake returns no existing rooms, so the resolver performs no database access.
    supabase: emptyRoomLookup() as any,
    roomPayload: parsed.roomPayload,
    detailPayload: parsed.detailPayload,
  });
  const quality = evaluateZaloImportQuality({
    roomPayload: resolved.roomPayload,
    detailPayload: resolved.detailPayload,
    sourceFieldMap: parsed.sourceFieldMap,
    inheritedFieldMap: resolved.inheritedFieldMap,
    matchedRoom: resolved.matchedRoom,
    importIssues: issues,
    expectedImageCount: media.expected,
    expectedVideoCount: 0,
    importedImageCount: media.imported,
    importedVideoCount: 0,
    groupName: "FIXTURE GROUP",
    settings: safeSettings,
  });

  const stagedShape = JSON.parse(JSON.stringify({
    room_payload: {
      ...resolved.roomPayload,
      import_quality: quality,
      import_diagnostics: { issues },
    },
    detail_payload: resolved.detailPayload,
    source_field_map: parsed.sourceFieldMap,
    inherited_field_map: resolved.inheritedFieldMap,
    media: {
      expected: media.expected,
      imported: media.imported,
      image_message_ids: preview.imageMessageIds,
      image_urls: preview.imageUrls,
    },
  }));

  return { parsed, resolved, quality, stagedShape };
}

const building = "391/146 Trần Hưng Đạo, Q1";

check("A: semantic → parser → resolver → quality → staged shape, một phòng/một album", async () => {
  const previews = semantic([
    textMessage("a-building", building, 1_000),
    textMessage("a-room", "Studio/BC - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("a-image", "a-album", 3_000),
  ]);
  assert.equal(previews.length, 1);
  const result = await throughStagingBoundary(previews[0], { expected: 1, imported: 1 });
  assert.equal(result.parsed.roomPayload.room_code, "103");
  assert.equal(result.parsed.roomPayload.price, 6_900_000);
  assert.equal(result.parsed.roomPayload.status, "Trống");
  assert.deepEqual(result.stagedShape.media.image_message_ids, ["a-image"]);
});

check("B: ba phòng giữ đúng mã, giá và album riêng qua parser và quality", async () => {
  const previews = semantic([
    textMessage("b-building", building, 1_000),
    textMessage("b-103", "Studio/BC - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("b-photo-103", "b-album-103", 3_000),
    textMessage("b-502", "Studio/CS - 6.300.000 - P.502 - trống sẵn", 4_000),
    imageMessage("b-photo-502", "b-album-502", 5_000),
    textMessage("b-401", "Studio/BC - 9.500.000 - P.401 - trống sẵn", 6_000),
    imageMessage("b-photo-401", "b-album-401", 7_000),
  ]);
  assert.equal(previews.length, 3);
  const results = await Promise.all(previews.map((preview) =>
    throughStagingBoundary(preview, { expected: 1, imported: 1 })
  ));
  assert.deepEqual(
    results.map(({ parsed, stagedShape }) => [
      parsed.roomPayload.room_code,
      parsed.roomPayload.price,
      stagedShape.media.image_message_ids[0],
      parsed.roomPayload.status,
    ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ["103", 6_900_000, "b-photo-103", "Trống"],
      ["401", 9_500_000, "b-photo-401", "Trống"],
      ["502", 6_300_000, "b-photo-502", "Trống"],
    ]
  );
  assert.ok(results.every((result) => result.quality.blockers.some((item) => item.code === "GROUP_NOT_ALLOWED")));
});

check("C: hai mã trong một dòng cùng giá/media thành hai staging payload", async () => {
  const previews = semantic([
    textMessage("c-building", building, 1_000),
    textMessage("c-rooms", "Studio/CS - 6.900.000 - P.G01 + P.102 - trống sẵn", 2_000),
    imageMessage("c-shared-photo", "c-shared-album", 3_000),
  ]);
  assert.equal(previews.length, 2);
  const results = await Promise.all(previews.map((preview) =>
    throughStagingBoundary(preview, { expected: 1, imported: 1 })
  ));
  assert.deepEqual(results.map((result) => result.parsed.roomPayload.room_code).sort(), ["102", "G01"]);
  assert.ok(results.every((result) => result.parsed.roomPayload.price === 6_900_000));
  assert.deepEqual(results.map((result) => result.stagedShape.media.image_message_ids), [["c-shared-photo"], ["c-shared-photo"]]);
});

check("D: giá khác nhau dùng cùng một album khi parser nhận cùng media group", async () => {
  const previews = semantic([
    textMessage("d-building", building, 1_000),
    textMessage("d-101", "Studio/BC - 8.500.000 - P.101 - trống sẵn", 2_000),
    textMessage("d-501", "Studio/BC - 9.000.000 - P.501 - trống sẵn", 3_000),
    imageMessage("d-reference-photo", "d-reference-album", 4_000),
  ]);
  assert.equal(previews.length, 2);
  const results = await Promise.all(previews.map((preview) =>
    throughStagingBoundary(preview, { expected: 1, imported: 1 })
  ));
  assert.deepEqual(results.map((result) => result.parsed.roomPayload.price).sort(), [8_500_000, 9_000_000]);
  assert.ok(results.every((result) => result.stagedShape.media.image_message_ids.includes("d-reference-photo")));
});

check("E/F: mã tầng độc lập và mã P04 + Lầu 2 được giữ qua resolve", async () => {
  const floors = semantic([
    textMessage("ef-building", building, 1_000),
    textMessage("ef-floors", "Studio/CS - 11.000.000 - Lầu 1 + Lầu 2 - trống sẵn", 2_000),
    imageMessage("ef-floor-photo", "ef-floor-album", 3_000),
  ]);
  const composite = semantic([
    textMessage("ef-composite-building", building, 4_000),
    textMessage("ef-composite", "Studio/BC - 9.000.000 - P04 - Lầu 2 - trống sẵn", 5_000),
    imageMessage("ef-composite-photo", "ef-composite-album", 6_000),
  ]);
  assert.equal(floors.length, 2);
  const floorResults = await Promise.all(floors.map((preview) =>
    throughStagingBoundary(preview, { expected: 1, imported: 1 })
  ));
  const compositeResult = await throughStagingBoundary(composite[0], { expected: 1, imported: 1 });
  assert.deepEqual(floorResults.map((result) => result.parsed.roomPayload.room_code).sort(), ["Lầu 1", "Lầu 2"]);
  assert.equal(compositeResult.parsed.roomPayload.room_code, "P04 _ Lầu 2");
});

check("G: phí tòa nhà và CS/BC được áp dụng nhất quán, không biến thành room type", async () => {
  const previews = semantic([
    textMessage("g-building", `${building}\nPhí điện: 4.000/kwh\nPhí nước: 150k/người\nPhí dịch vụ: 200k/phòng`, 1_000),
    textMessage("g-window", "Studio/CS - 11.000.000 - Lầu 1 - trống sẵn", 2_000),
    imageMessage("g-photo-1", "g-album-1", 3_000),
    textMessage("g-balcony", "Studio/BC - 12.000.000 - Lầu 2 - trống sẵn", 4_000),
    imageMessage("g-photo-2", "g-album-2", 5_000),
  ]);
  assert.equal(previews.length, 2);
  const results = await Promise.all(previews.map((preview) =>
    throughStagingBoundary(preview, { expected: 1, imported: 1 })
  ));
  assert.ok(results.every((result) => result.parsed.roomPayload.room_type === "Studio"));
  assert.ok(results.every((result) => result.parsed.detailPayload.electric_fee_value === 4_000));
  assert.ok(results.every((result) => result.parsed.detailPayload.water_fee_value === 150_000));
  assert.ok(results.every((result) => result.parsed.detailPayload.service_fee_value === 200_000));
  const byRoomCode = new Map(results.map((result) => [
    result.parsed.roomPayload.room_code,
    result.parsed.detailPayload.other_amenities,
  ]));
  assert.match(byRoomCode.get("Lầu 1"), /cửa sổ/i);
  assert.match(byRoomCode.get("Lầu 2"), /ban công/i);
});

check("H: thiếu trạng thái hoặc mã phòng tạo quality blocker tương ứng", async () => {
  const noStatus = semantic([
    textMessage("h-status-building", building, 1_000),
    textMessage("h-no-status", "Studio/BC - 6.900.000 - P.103", 2_000),
    imageMessage("h-status-photo", "h-status-album", 3_000),
  ])[0];
  const noCode = semantic([
    textMessage("h-code-building", building, 4_000),
    textMessage("h-no-code", "Studio - 6.900.000 - trống sẵn", 5_000),
    imageMessage("h-code-photo", "h-code-album", 6_000),
  ])[0];
  const noStatusResult = await throughStagingBoundary(noStatus, { expected: 1, imported: 1 });
  const noCodeResult = await throughStagingBoundary(noCode, { expected: 1, imported: 1 });
  assert.equal(noStatusResult.parsed.roomPayload.status, null);
  assert.ok(noStatusResult.quality.blockers.some((item) => item.code === "MISSING_STATUS"));
  assert.equal(noCodeResult.parsed.roomPayload.room_code, "");
  assert.ok(noCodeResult.quality.blockers.some((item) => item.code === "MISSING_ROOM_CODE"));
});

check("I: album thiếu ảnh được biểu diễn thành lỗi import và quality blocker", async () => {
  const preview = semantic([
    textMessage("i-building", building, 1_000),
    textMessage("i-room", "Studio/BC - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("i-only-photo", "i-incomplete-album", 3_000, 2),
  ])[0];
  assert.equal(preview.albums[0].complete, false);
  const result = await throughStagingBoundary(
    preview,
    { expected: 2, imported: 1 },
    [{ level: "error", stage: "media", message: "Reader phát hiện album ảnh chưa đầy đủ. Dự kiến 2 ảnh, hiện có 1 ảnh." }]
  );
  assert.equal(result.stagedShape.media.expected, 2);
  assert.equal(result.stagedShape.media.imported, 1);
  assert.ok(result.quality.blockers.some((item) => item.code === "IMAGE_IMPORT_INCOMPLETE"));
  assert.ok(result.quality.blockers.some((item) => item.code === "IMPORT_ERROR"));
});

check("J: gửi lại cùng preview giữ sourceHash ổn định để API nhận diện duplicate", () => {
  const messages = [
    textMessage("j-building", building, 1_000),
    textMessage("j-room", "Studio/BC - 6.900.000 - P.103 - trống sẵn", 2_000),
    imageMessage("j-photo", "j-album", 3_000),
  ];
  const first = semantic(messages);
  const retry = semantic(messages);
  const changedPrice = semantic([
    textMessage("j-building", building, 1_000),
    textMessage("j-room", "Studio/BC - 7.200.000 - P.103 - trống sẵn", 2_000),
    imageMessage("j-photo", "j-album", 3_000),
  ]);
  assert.equal(first.length, 1);
  assert.equal(retry.length, 1);
  assert.equal(changedPrice.length, 1);
  assert.equal(first[0].sourceHash, retry[0].sourceHash);
  assert.notEqual(first[0].sourceHash, changedPrice[0].sourceHash);
  const request = JSON.parse(JSON.stringify({
    sourceHash: first[0].sourceHash,
    rawText: first[0].fullText,
    imageUrls: first[0].imageUrls,
    imageMessageIds: first[0].imageMessageIds,
  }));
  assert.equal(request.sourceHash, first[0].sourceHash);
  assert.deepEqual(request.imageMessageIds, ["j-photo"]);
});

check("K: cùng địa chỉ + mã phòng, giá mới được gắn vào pending trùng chứ không tự ghi đè phòng", async () => {
  const parsed = parseZaloRoomText(
    `${building}\n\nStudio/BC - 9.000.000 - P.103 - trống sẵn`
  );
  const resolved = await resolveZaloImportRoom({
    supabase: roomLookup([{
      id: "existing-room",
      room_code: "103",
      house_number: "391/146",
      address: "Trần Hưng Đạo",
      district: "Q1",
      price: 8_000_000,
      status: "Trống",
      updated_at: "2026-01-01T00:00:00.000Z",
    }]) as any,
    roomPayload: parsed.roomPayload,
    detailPayload: parsed.detailPayload,
  });
  assert.equal(resolved.matchedRoom?.id, "existing-room");
  assert.match(resolved.matchedReason, /mã phòng/);
  assert.equal(resolved.roomPayload.price, 9_000_000);
  assert.equal(resolved.matchedRoom.price, 8_000_000);
});

check("L: trùng mã phòng nhưng khác địa chỉ không bị resolver coi là cùng phòng", async () => {
  const otherBuilding = "25 Nguyễn Văn Cừ, Q5";
  const parsed = parseZaloRoomText(
    `${otherBuilding}\n\nStudio/BC - 9.000.000 - P.103 - trống sẵn`
  );
  const resolved = await resolveZaloImportRoom({
    supabase: roomLookup([{
      id: "different-address-room",
      room_code: "103",
      house_number: "391/146",
      address: "Trần Hưng Đạo",
      district: "Q1",
      price: 9_000_000,
      status: "Trống",
      updated_at: "2026-01-01T00:00:00.000Z",
    }]) as any,
    roomPayload: parsed.roomPayload,
    detailPayload: parsed.detailPayload,
  });
  assert.equal(resolved.matchedRoom, null);
});

async function main() {
  let failed = 0;
  for (const { name, run } of checks) {
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }
  console.log(`Zalo import integration fixtures: ${checks.length - failed}/${checks.length} passed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
