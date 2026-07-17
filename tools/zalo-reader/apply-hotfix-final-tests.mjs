import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const readerDir = path.dirname(scriptPath);
const parserDir = path.join(readerDir, "parsers");

const smokePath = path.join(
  parserDir,
  "semantic-parser-smoke-test.ts"
);

const lookbackPath = path.join(
  parserDir,
  "phase3-message-lookback-smoke-test.ts"
);

for (const filePath of [smokePath, lookbackPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Không tìm thấy file: ${filePath}`);
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function newlineOf(source) {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

let smoke = read(smokePath);
let lookback = read(lookbackPath);

/*
 * Test cũ chờ:
 *   902
 *   503+803 (1 record)
 *
 * Kiến trúc mới đúng là:
 *   902
 *   503
 *   803
 */
const oldSmokeBlock = `assert.equal(multipleVacantRoomMarkers.length, 2);
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
assert.equal(room503.markerText, "Trống mã 503 + 803 giá 6tr");`;

const newSmokeBlock = `assert.equal(multipleVacantRoomMarkers.length, 3);

const room902 = multipleVacantRoomMarkers.find((room) =>
  room.markerText.includes("902")
);

const shared503And803 =
  multipleVacantRoomMarkers.filter((room) =>
    room.markerText.includes("503 + 803")
  );

if (!room902 || shared503And803.length !== 2) {
  throw new Error(
    "Không tách được 902 và hai phòng 503/803 dùng chung marker"
  );
}

assert.deepEqual(
  room902.imageMessageIds,
  ["902-a", "902-b"]
);

for (const room of shared503And803) {
  assert.deepEqual(room.imageMessageIds, [
    "503-a",
    "503-b",
    "503-c",
  ]);

  assert.equal(
    room.markerText,
    "Trống mã 503 + 803 giá 6tr"
  );
}

assert.equal(
  room902.markerText,
  "Trống mã 902 giá 4tr8"
);`;

if (!smoke.includes(oldSmokeBlock)) {
  throw new Error(
    [
      "Không tìm thấy block regression cũ của 503 + 803.",
      "Không ghi file để tránh sửa nhầm.",
    ].join(" ")
  );
}

smoke = smoke.replace(oldSmokeBlock, newSmokeBlock);

/*
 * Build TypeScript cần biết filtered.messages là đúng kiểu parser.
 */
const nl = newlineOf(lookback);

if (!lookback.includes('import type { SemanticIndexedDbMessage } from "./types";')) {
  const importAnchor =
    'import { buildSemanticTimelineRooms } from "./index";';

  if (!lookback.includes(importAnchor)) {
    throw new Error(
      "Không tìm thấy import buildSemanticTimelineRooms."
    );
  }

  lookback = lookback.replace(
    importAnchor,
    [
      importAnchor,
      'import type { SemanticIndexedDbMessage } from "./types";',
    ].join(nl)
  );
}

const oldMessagesLine =
  "  messages: filtered.messages,";

const newMessagesLine =
  "  messages: filtered.messages as SemanticIndexedDbMessage[],";

if (!lookback.includes(oldMessagesLine)) {
  throw new Error(
    "Không tìm thấy messages: filtered.messages trong lookback test."
  );
}

lookback = lookback.replace(
  oldMessagesLine,
  newMessagesLine
);

/*
 * Backup cạnh file.
 */
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

fs.copyFileSync(
  smokePath,
  `${smokePath}.before-hotfix-${stamp}.bak`
);

fs.copyFileSync(
  lookbackPath,
  `${lookbackPath}.before-hotfix-${stamp}.bak`
);

write(smokePath, smoke);
write(lookbackPath, lookback);

console.log("Hotfix test cuối đã áp dụng.");
console.log("- Cập nhật regression 503 + 803 thành 2 phòng.");
console.log("- Sửa type của filtered.messages.");
console.log("");
console.log("Chạy:");
console.log("npm run test:zalo-parser");
console.log("npm run test:zalo-lookback");
console.log("npm run build:webpack");
