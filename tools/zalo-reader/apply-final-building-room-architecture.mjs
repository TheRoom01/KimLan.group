import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const readerDir = path.dirname(scriptPath);
const rootDir = path.resolve(readerDir, "../..");
const parserDir = path.join(readerDir, "parsers");

const files = {
  utils: path.join(parserDir, "utils.ts"),
  semantic: path.join(parserDir, "semantic-timeline-v2.ts"),
  smoke: path.join(parserDir, "semantic-parser-smoke-test.ts"),
  reader: path.join(readerDir, "zalo-reader.before-semantic-parser.ts"),
  packageJson: path.join(rootDir, "package.json"),
};

for (const [label, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) throw new Error(`Không tìm thấy ${label}: ${filePath}`);
}

const read = (filePath) => fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
const write = (filePath, content) => fs.writeFileSync(filePath, content, "utf8");
const nl = (source) => (source.includes("\r\n") ? "\r\n" : "\n");

const original = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, read(filePath)])
);

if (
  original.utils.includes("FINAL_BLOCK_ROOM_DATE_GUARD") &&
  original.semantic.includes("FINAL_SHARED_ALBUM_MULTI_ROOM") &&
  original.semantic.includes("FINAL_MEDIA_REVIEW_ROOM")
) {
  console.log("Patch cuối đã tồn tại. Không ghi đè lại.");
  process.exit(0);
}

let nextReader = original.reader.replace(
  /const roomImportMessages\s*=\s*messageLookbackResult\.messages\s+as IndexedDbGroupMessage\[\];/m,
  "const roomImportMessages =\n    messageLookbackResult.messages as IndexedDbGroupMessage[];"
);

function patchUtils(source) {
  const newline = nl(source);
  let next = source;
  const anchor = "export function extractAddressKey(input: unknown) {";
  if (!next.includes(anchor)) throw new Error("Không tìm thấy extractAddressKey trong utils.ts");

  const helper = [
    "/* FINAL_BLOCK_ROOM_DATE_GUARD */",
    "function isDatedRoomMarkerText(input: unknown) {",
    "  const text = cleanText(input);",
    "  if (!text || !hasRoomPrice(text)) return false;",
    "",
    "  return text",
    '    .split("\\n")',
    "    .map((line) => stripLeadingDecorations(line))",
    "    .some((line) =>",
    "      /^\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\s+(?=(?:trong|trong san|con trong|phong trong|dang trong|available|phong|ma phong|ma)\\b)/i.test(",
    "        line",
    "      )",
    "    );",
    "}",
    "",
  ].join(newline);

  next = next.replace(anchor, helper + anchor);

  const bodyAnchor = [
    "export function extractAddressKey(input: unknown) {",
    "  const text = cleanText(input);",
    '  if (!text) return "";',
  ].join(newline);

  if (!next.includes(bodyAnchor)) throw new Error("Không tìm thấy phần đầu extractAddressKey");

  next = next.replace(
    bodyAnchor,
    [
      bodyAnchor,
      "",
      "  /* Ngày đăng + trạng thái phòng + giá không phải địa chỉ. */",
      '  if (isDatedRoomMarkerText(text)) return "";',
    ].join(newline)
  );

  return next;
}

function patchBuildRoomAnchors(source) {
  const newline = nl(source);
  const oldBlock = [
    "    classification.roomAnchors.forEach((anchor, anchorIndex) => {",
    "      rooms.push({",
    "        id: [",
    "          segment.id,",
    "          String(message.msgId || message.cliMsgId || messageIndex),",
    "          anchorIndex,",
    '        ].join(":"),',
    '        messageId: String(message.msgId || message.cliMsgId || "").trim(),',
    "        messageIndex,",
    "        timestamp: messageTimestamp(message),",
    '        senderUid: String(message.fromUid || "").trim(),',
    "        markerText: anchor.markerText,",
    "        roomCode: anchor.roomCode,",
    "        descriptionTexts: [],",
    "      });",
    "    });",
  ].join(newline);

  if (!source.includes(oldBlock)) throw new Error("Không tìm thấy buildRoomAnchors block");

  const newBlock = [
    "    classification.roomAnchors.forEach((anchor, anchorIndex) => {",
    '      const roomCodes = String(anchor.roomCode || "")',
    '        .split("+")',
    "        .map((value) => value.trim())",
    "        .filter(Boolean);",
    "",
    '      const expandedCodes = roomCodes.length > 0 ? roomCodes : [""];',
    "",
    "      expandedCodes.forEach((roomCode, codeIndex) => {",
    "        rooms.push({",
    "          id: [",
    "            segment.id,",
    "            String(message.msgId || message.cliMsgId || messageIndex),",
    "            anchorIndex,",
    "            codeIndex,",
    '          ].join(":"),',
    '          messageId: String(message.msgId || message.cliMsgId || "").trim(),',
    "          messageIndex,",
    "          timestamp: messageTimestamp(message),",
    '          senderUid: String(message.fromUid || "").trim(),',
    "          markerText: anchor.markerText,",
    "          roomCode,",
    "          descriptionTexts: [],",
    "        });",
    "      });",
    "    });",
  ].join(newline);

  return source.replace(oldBlock, newBlock);
}

function patchBuildRoomsForSegment(source) {
  const newline = nl(source);
  let next = source;

  const oldNoRooms = [
    "  if (rooms.length === 0) {",
    "    const hasMedia = bundles.length > 0;",
    "    const hasText = segment.messages.some(",
    "      (message) => message.kind === \"text\" && Boolean(cleanText(message.text)),",
    "    );",
    "",
    "    const mayCreate =",
    "      (hasMedia && options.allowMediaOnly !== false) ||",
    "      (hasText && options.allowTextOnly !== false);",
    "",
    "    if (!mayCreate) return [];",
    "",
    "    rooms = [makeSyntheticRoom({ segment, bundles })];",
    "  }",
  ].join(newline);

  if (!next.includes(oldNoRooms)) throw new Error("Không tìm thấy block synthetic room cũ");

  const newNoRooms = [
    "  if (rooms.length === 0) {",
    "    /* FINAL_MEDIA_REVIEW_ROOM */",
    "    /* Chỉ text thì không tạo phòng giả; có media thì tạo review card. */",
    "    if (bundles.length === 0) return [];",
    "",
    "    rooms = bundles.map((bundle, bundleIndex) => {",
    "      const synthetic = makeSyntheticRoom({ segment, bundles: [bundle] });",
    "      return {",
    "        ...synthetic,",
    "        id: `${segment.id}:media-review:${bundleIndex}`,",
    "        messageId: bundle.messageIds[0] || synthetic.messageId,",
    "        messageIndex: bundle.firstMessageIndex,",
    "        timestamp: bundle.firstTimestamp || synthetic.timestamp,",
    "        senderUid: bundle.senderUid || synthetic.senderUid,",
    "      };",
    "    });",
    "  }",
  ].join(newline);

  next = next.replace(oldNoRooms, newNoRooms);

  const assignmentAnchor = [
    "  const assignment = assignPhase2MediaToRooms({",
    "    rooms,",
    "    bundles,",
    "    options,",
    "  });",
  ].join(newline);

  if (!next.includes(assignmentAnchor)) throw new Error("Không tìm thấy assignment call");

  const sharedLogic = [
    assignmentAnchor,
    "",
    "  /* FINAL_SHARED_ALBUM_MULTI_ROOM */",
    "  const realMarkerRooms = rooms.filter((room) => Boolean(cleanText(room.markerText)));",
    "  const markerMessageIds = new Set(realMarkerRooms.map((room) => room.messageId).filter(Boolean));",
    "  const markerMessageIndexes = new Set(realMarkerRooms.map((room) => room.messageIndex));",
    "  const mayShareSingleAlbum =",
    "    bundles.length === 1 &&",
    "    realMarkerRooms.length > 1 &&",
    "    (markerMessageIds.size === 1 || markerMessageIndexes.size === 1);",
    "",
    "  if (mayShareSingleAlbum) {",
    "    const sharedBundle = bundles[0];",
    "    for (const room of realMarkerRooms) {",
    "      assignment.assignedByRoomId.set(room.id, [sharedBundle]);",
    "      assignment.warningsByRoomId.get(room.id)?.add(\"SHARED_ALBUM_MULTI_ROOM_MESSAGE\");",
    "    }",
    "    assignment.unassignedBundles.splice(0, assignment.unassignedBundles.length);",
    "  }",
    "",
    "  if (!hadRealRoomMarker && rooms.length === bundles.length) {",
    "    rooms.forEach((room, index) => {",
    "      const bundle = bundles[index];",
    "      if (!bundle) return;",
    "      assignment.assignedByRoomId.set(room.id, [bundle]);",
    "      assignment.warningsByRoomId.get(room.id)?.add(\"UNASSIGNED_MEDIA_REVIEW_REQUIRED\");",
    "    });",
    "    assignment.unassignedBundles.splice(0, assignment.unassignedBundles.length);",
    "  }",
  ].join(newline);

  next = next.replace(assignmentAnchor, sharedLogic);

  next = next.replace(
    [
      "    if (!hadRealRoomMarker) {",
      '      warnings.add("NO_ROOM_MARKER");',
      '      warnings.add("ROOM_CODE_MISSING");',
      "    }",
    ].join(newline),
    [
      "    if (!hadRealRoomMarker) {",
      '      warnings.add("NO_ROOM_MARKER");',
      '      warnings.add("ROOM_MARKER_MISSING");',
      '      warnings.add("ROOM_CODE_MISSING");',
      '      warnings.add("UNASSIGNED_MEDIA_REVIEW_REQUIRED");',
      "    }",
    ].join(newline)
  );

  next = next.replace(
    [
      "    if (!houseInfoText) {",
      '      warnings.add("NO_HOUSE_INFO");',
      "    }",
    ].join(newline),
    [
      "    if (!houseInfoText) {",
      '      warnings.add("NO_HOUSE_INFO");',
      '      warnings.add("HOUSE_INFO_MISSING");',
      "    }",
    ].join(newline)
  );

  next = next.replace(
    [
      "    if (imageUrls.length === 0) {",
      '      warnings.add("NO_IMAGES");',
      "    }",
    ].join(newline),
    [
      "    if (imageUrls.length === 0) {",
      '      warnings.add("NO_IMAGES");',
      '      warnings.add("ROOM_MEDIA_MISSING");',
      "    }",
    ].join(newline)
  );

  return next;
}

function patchSemantic(source) {
  return patchBuildRoomsForSegment(patchBuildRoomAnchors(source));
}

function patchSmoke(source) {
  if (source.includes("Final building-room architecture regression: PASS")) return source;
  const newline = nl(source);
  const tests = [
    "",
    "/* FINAL BUILDING / ROOM ARCHITECTURE REGRESSION */",
    "const finalKinhDuong = buildSemanticTimelineRooms({",
    '  groupName: "FINAL-KINH-DUONG",',
    '  groupId: "g-final-1",',
    "  messages: [",
    '    textMessage("kd-building", "HIFRIENDZ THÔNG BÁO DỰ ÁN MỚI: 36 Kinh Dương Vương Q6\\nĐiện: 4k/kwh\\nNước: 200k/người", 100_000),',
    '    imageMessage("kd-image", "kd-album", 0, 1, 101_000),',
    '    textMessage("kd-markers", "1/8 Trống 202 9tr\\n1/8 Trống 302 9tr\\nBan công trước", 102_000),',
    "  ],",
    "});",
    "assert.equal(finalKinhDuong.length, 2);",
    "assert.ok(finalKinhDuong.every((room) => room.imageMessageIds.includes(\"kd-image\")));",
    "assert.ok(finalKinhDuong.every((room) => room.houseInfoText.includes(\"36 Kinh Dương Vương\")));",
    "",
    "const finalDuongBaTrac = buildSemanticTimelineRooms({",
    '  groupName: "FINAL-DUONG-BA-TRAC",',
    '  groupId: "g-final-2",',
    "  messages: [",
    '    textMessage("dbt-separator-start", "➖➖➖➖➖///➖➖➖➖➖", 200_000),',
    '    textMessage("dbt-building", "284E-285E Dương Bá Trạc-F1-Quận 8\\nĐiện 4.00d/kWh\\nNước 100k/người\\nPdv: 2000k/tháng", 201_000),',
    '    imageMessage("dbt-image", "dbt-album", 0, 1, 202_000),',
    '    textMessage("dbt-marker", "1PN - 301 + 302 + 304 : 6.200.000 máy giặt riêng", 203_000),',
    '    textMessage("dbt-separator-end", "➖➖➖➖➖///➖➖➖➖➖", 204_000),',
    "  ],",
    "});",
    "assert.equal(finalDuongBaTrac.length, 3);",
    "assert.ok(finalDuongBaTrac.every((room) => room.imageMessageIds.includes(\"dbt-image\")));",
    "",
    "const finalTextOnlyBuilding = buildSemanticTimelineRooms({",
    '  groupName: "FINAL-TEXT-ONLY",',
    '  groupId: "g-final-3",',
    '  messages: [textMessage("text-only-building", "284E-285E Dương Bá Trạc\\nPdv: 2000k/tháng", 300_000)],',
    "});",
    "assert.equal(finalTextOnlyBuilding.length, 0);",
    "",
    "const finalMediaReview = buildSemanticTimelineRooms({",
    '  groupName: "FINAL-MEDIA-REVIEW",',
    '  groupId: "g-final-4",',
    "  messages: [",
    '    textMessage("review-building", "36 Kinh Dương Vương Q6\\nĐiện 4k\\nNước 200k", 400_000),',
    '    imageMessage("review-image", "review-album", 0, 1, 401_000),',
    "  ],",
    "});",
    "assert.equal(finalMediaReview.length, 1);",
    "assert.deepEqual(finalMediaReview[0].imageMessageIds, [\"review-image\"]);",
    "assert.ok(finalMediaReview[0].warnings.includes(\"ROOM_MARKER_MISSING\"));",
    "assert.ok(finalMediaReview[0].warnings.includes(\"UNASSIGNED_MEDIA_REVIEW_REQUIRED\"));",
    "",
    'console.log("Final building-room architecture regression: PASS");',
    "",
  ].join(newline);
  return source.trimEnd() + newline + tests;
}

const nextUtils = patchUtils(original.utils);
const nextSemantic = patchSemantic(original.semantic);
const nextSmoke = patchSmoke(original.smoke);

let packageJson;
try {
  packageJson = JSON.parse(original.packageJson);
} catch (error) {
  throw new Error(`package.json không hợp lệ: ${error.message}`);
}
packageJson.scripts = {
  ...(packageJson.scripts || {}),
  "patch:zalo-reader-final": "node tools/zalo-reader/apply-final-building-room-architecture.mjs",
};
const nextPackage = `${JSON.stringify(packageJson, null, 2)}\n`;

const checks = [
  nextUtils.includes("FINAL_BLOCK_ROOM_DATE_GUARD"),
  nextSemantic.includes("expandedCodes.forEach"),
  nextSemantic.includes("FINAL_SHARED_ALBUM_MULTI_ROOM"),
  nextSemantic.includes("FINAL_MEDIA_REVIEW_ROOM"),
  nextSmoke.includes("Final building-room architecture regression: PASS"),
];
if (checks.some((value) => !value)) throw new Error("Xác minh patch thất bại. Không ghi file.");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(rootDir, ".zalo-reader", "final-building-room-backups", stamp);
for (const filePath of Object.values(files)) {
  const destination = path.join(backupRoot, path.relative(rootDir, filePath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(filePath, destination);
}

write(files.utils, nextUtils);
write(files.semantic, nextSemantic);
write(files.smoke, nextSmoke);
write(files.reader, nextReader);
write(files.packageJson, nextPackage);

console.log("\nPatch cuối kiến trúc Block tòa nhà / Phòng đã áp dụng.");
console.log(`Backup: ${backupRoot}`);
console.log("\nChạy:");
console.log("npm run test:zalo-parser");
console.log("npm run test:zalo-lookback");
console.log("npm run build:webpack");
