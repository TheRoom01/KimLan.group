import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const readerDir = path.dirname(scriptPath);
const parserPath = path.join(
  readerDir,
  "parsers",
  "semantic-timeline-v2.ts"
);

if (!fs.existsSync(parserPath)) {
  throw new Error(`Không tìm thấy: ${parserPath}`);
}

let source = fs
  .readFileSync(parserPath, "utf8")
  .replace(/^\uFEFF/, "");

if (source.includes("FINAL_SHARED_SIBLING_ROOMS")) {
  console.log("Hotfix sibling rooms đã tồn tại.");
  process.exit(0);
}

const newline = source.includes("\r\n") ? "\r\n" : "\n";

const anchor = [
  "  if (mayShareSingleAlbum) {",
  "    const sharedBundle = bundles[0];",
].join(newline);

const anchorIndex = source.indexOf(anchor);

if (anchorIndex < 0) {
  throw new Error(
    "Không tìm thấy block FINAL_SHARED_ALBUM_MULTI_ROOM."
  );
}

const insertAfter = [
  "  if (mayShareSingleAlbum) {",
  "    const sharedBundle = bundles[0];",
  "",
  "    for (const room of realMarkerRooms) {",
  "      assignment.assignedByRoomId.set(room.id, [sharedBundle]);",
  "      assignment.warningsByRoomId",
  "        .get(room.id)",
  '        ?.add("SHARED_ALBUM_MULTI_ROOM_MESSAGE");',
  "    }",
  "",
  "    assignment.unassignedBundles.splice(",
  "      0,",
  "      assignment.unassignedBundles.length",
  "    );",
  "  }",
].join(newline);

if (!source.includes(insertAfter)) {
  throw new Error(
    [
      "Không tìm thấy toàn bộ block share album hiện tại.",
      "Không ghi file để tránh sửa nhầm.",
    ].join(" ")
  );
}

const siblingLogic = [
  insertAfter,
  "",
  "  /* FINAL_SHARED_SIBLING_ROOMS */",
  "  /*",
  "   * Khi một marker message chứa nhiều mã phòng, buildRoomAnchors",
  "   * đã tách thành nhiều room có cùng messageId. Scoring thường chỉ",
  "   * gắn album vào một room đầu tiên; các room anh em phải nhận cùng",
  "   * album đó.",
  "   *",
  "   * Ví dụ:",
  "   *   Trống mã 503 + 803 giá 6tr",
  "   *   => 503 và 803 cùng dùng album nằm sát marker này.",
  "   */",
  "  const siblingRoomsByMessageId =",
  "    new Map<string, RoomAnchor[]>();",
  "",
  "  for (const room of realMarkerRooms) {",
  "    const messageId = String(room.messageId || \"\").trim();",
  "    if (!messageId) continue;",
  "",
  "    const siblings =",
  "      siblingRoomsByMessageId.get(messageId) || [];",
  "    siblings.push(room);",
  "    siblingRoomsByMessageId.set(messageId, siblings);",
  "  }",
  "",
  "  for (const siblings of siblingRoomsByMessageId.values()) {",
  "    if (siblings.length <= 1) continue;",
  "",
  "    const assignedBundles = siblings",
  "      .flatMap((room) =>",
  "        assignment.assignedByRoomId.get(room.id) || []",
  "      )",
  "      .filter(",
  "        (bundle, index, values) =>",
  "          values.findIndex((item) => item.id === bundle.id) === index",
  "      );",
  "",
  "    /*",
  "     * Chỉ tự chia sẻ khi nhóm sibling đã xác định đúng một bundle.",
  "     * Nếu có nhiều bundle khác nhau thì giữ warning để admin review,",
  "     * không nhân ảnh mù quáng.",
  "     */",
  "    if (assignedBundles.length !== 1) continue;",
  "",
  "    const sharedBundle = assignedBundles[0];",
  "",
  "    for (const room of siblings) {",
  "      assignment.assignedByRoomId.set(room.id, [sharedBundle]);",
  "      assignment.warningsByRoomId",
  "        .get(room.id)",
  '        ?.add("SHARED_ALBUM_SIBLING_ROOM_CODES");',
  "    }",
  "",
  "    const unassignedIndex =",
  "      assignment.unassignedBundles.findIndex(",
  "        (bundle) => bundle.id === sharedBundle.id",
  "      );",
  "",
  "    if (unassignedIndex >= 0) {",
  "      assignment.unassignedBundles.splice(unassignedIndex, 1);",
  "    }",
  "  }",
].join(newline);

source = source.replace(insertAfter, siblingLogic);

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

fs.copyFileSync(
  parserPath,
  `${parserPath}.before-sibling-hotfix-${stamp}.bak`
);

fs.writeFileSync(parserPath, source, "utf8");

console.log("Hotfix shared sibling rooms đã áp dụng.");
console.log("- 503 và 803 cùng marker sẽ dùng chung album.");
console.log("- Chỉ share khi sibling group xác định đúng 1 album.");
console.log("");
console.log("Chạy:");
console.log("npm run test:zalo-parser");
console.log("npm run test:zalo-lookback");
console.log("npm run build:webpack");
