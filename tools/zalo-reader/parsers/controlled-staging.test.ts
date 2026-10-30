import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONTROLLED_ZALO_GROUP_ID,
  CONTROLLED_ZALO_GROUP_NAME,
  isControlledZaloTarget,
  selectControlledStagingRooms,
  shouldAutoPublishZaloImport,
} from "../../../lib/zalo-reader/controlled-staging";
import { makeZaloSourceHash } from "../../../lib/zalo-reader/request";

const t0 = Date.UTC(2026, 9, 28, 11, 0, 0);
const day = 24 * 60 * 60 * 1000;

assert.equal(
  isControlledZaloTarget({
    groupId: CONTROLLED_ZALO_GROUP_ID,
    groupName: CONTROLLED_ZALO_GROUP_NAME,
  }),
  true,
  "verified ID and exact group name are accepted"
);
assert.equal(
  isControlledZaloTarget({
    groupId: "g0000000000000000000",
    groupName: CONTROLLED_ZALO_GROUP_NAME,
  }),
  false,
  "same name with a different ID is rejected"
);
assert.equal(
  isControlledZaloTarget({
    groupId: CONTROLLED_ZALO_GROUP_ID,
    groupName: "Giỏ Hàng Căn Hộ Q1,Q3,Q10",
  }),
  false,
  "same ID with a different name is rejected"
);

const candidates = [
  { markerMessageId: "old", markerTimestamp: t0 - day - 1 },
  { markerMessageId: "start-boundary", markerTimestamp: t0 - day },
  { markerMessageId: "current-boundary", markerTimestamp: t0 },
  { markerMessageId: "future", markerTimestamp: t0 + 1 },
  { markerMessageId: "unknown", markerTimestamp: undefined },
  { markerMessageId: "", markerTimestamp: t0 - 1000 },
  { markerMessageId: "multi-room", markerTimestamp: t0 - 2000, room: "A" },
  { markerMessageId: "multi-room", markerTimestamp: t0 - 2000, room: "B" },
];
const selected = selectControlledStagingRooms({
  rooms: candidates,
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 10,
});
assert.deepEqual(
  Array.from(new Set(selected.rooms.map((room) => room.markerMessageId))).sort(),
  ["current-boundary", "multi-room", "start-boundary"].sort(),
  "the 24-hour window is inclusive at both ends and excludes old, future, missing-ID, and missing-time items"
);
assert.equal(selected.excludedUntrusted, 4);

const capped = selectControlledStagingRooms({
  rooms: [
    { markerMessageId: "one", markerTimestamp: t0 - 1, room: "A" },
    { markerMessageId: "one", markerTimestamp: t0 - 1, room: "B" },
    { markerMessageId: "two", markerTimestamp: t0 - 2, room: "C" },
    { markerMessageId: "three", markerTimestamp: t0 - 3, room: "D" },
  ],
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 2,
  maxRooms: 3,
});
assert.deepEqual(
  capped.rooms.map((room) => room.room),
  ["A", "B", "C"],
  "multiple rooms from one message are retained together while message and room caps are respected"
);
assert.equal(capped.selectedMessages, 2);
assert.equal(capped.limitedMessages, 1);

const cannotSplitMessage = selectControlledStagingRooms({
  rooms: [
    { markerMessageId: "two-rooms", markerTimestamp: t0 - 1, room: "A" },
    { markerMessageId: "two-rooms", markerTimestamp: t0 - 1, room: "B" },
    { markerMessageId: "one-room", markerTimestamp: t0 - 2, room: "C" },
  ],
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 1,
});
assert.deepEqual(
  cannotSplitMessage.rooms.map((room) => room.room),
  ["C"],
  "a multi-room source message is skipped whole when it cannot fit the record cap"
);
assert.equal(cannotSplitMessage.limitedRooms, 1);

assert.equal(
  shouldAutoPublishZaloImport({
    stagingOnly: true,
    eligible: true,
    enabled: true,
    dryRun: false,
  }),
  false,
  "staging-only always blocks auto-publish even if environment settings enable it"
);
assert.equal(
  shouldAutoPublishZaloImport({
    stagingOnly: false,
    eligible: true,
    enabled: true,
    dryRun: false,
  }),
  true,
  "regular import behavior remains controlled by its existing settings"
);

const hashInput = {
  groupName: CONTROLLED_ZALO_GROUP_NAME,
  senderName: "sender",
  sourceMessageId: "message-1",
  sentAt: new Date(t0).toISOString(),
  rawText: "Studio - 10.000.000 - P.101 - trống",
};
assert.equal(
  makeZaloSourceHash(hashInput),
  makeZaloSourceHash(hashInput),
  "resubmitting the same stable source identity produces the same fallback hash"
);
assert.notEqual(
  makeZaloSourceHash(hashInput),
  makeZaloSourceHash({ ...hashInput, sourceMessageId: "message-2" }),
  "a different source message has a different hash"
);

const projectRoot = path.resolve(__dirname, "../../..");
const readerSource = fs.readFileSync(
  path.join(projectRoot, "tools/zalo-reader/zalo-reader.before-semantic-parser.ts"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(projectRoot, "lib/zalo-reader/import-service.ts"),
  "utf8"
);
const config = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "tools/zalo-reader/config.json"), "utf8")
);
const groupRefs = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "tools/zalo-reader/group-refs.json"), "utf8")
);
assert.equal(config.previewOnly, false, "controlled staging trial is allowed to submit drafts");
assert.equal(config.stagingOnlyImport, true, "trial writes remain restricted to staging");
assert.equal(config.stagingOnlyMaxMessages, 10, "trial source-message cap is ten");
assert.equal(config.indexedDbImportLimit, 20, "trial room-record cap is twenty");
assert.equal(config.messageLookbackHours, 24, "trial uses a 24-hour window");
assert.equal(config.strictMessageLookback, true, "trial uses strict message timestamps");
assert.equal(
  groupRefs["Gio-Hang-Can-Ho-Q1-Q3-Q10"]?.groupId,
  CONTROLLED_ZALO_GROUP_ID,
  "the saved group reference is the user-confirmed ID"
);
assert.match(readerSource, /config\.stagingOnlyImport\s*\?[\s\S]*?config\.groups\.filter/);
assert.match(readerSource, /readerStartedAtMs\s*-\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
assert.match(readerSource, /readerStartedAtMs:\s*roomUnit\.readerStartedAtMs/);
assert.match(readerSource, /Staging trial đã kết thúc sau đúng một lượt/);
assert.match(readerSource, /safeMediaSourceLabel\(src\)/);
assert.match(serviceSource, /isControlledZaloTarget\(/);
assert.match(serviceSource, /shouldAutoPublishZaloImport\(/);
assert.match(serviceSource, /auto_approve_enabled:\s*false/);
assert.ok(
  serviceSource.indexOf('.eq(\n          "source_hash"') <
    serviceSource.indexOf('stage = "batch-insert"'),
  "the existing source_hash duplicate check runs before batch creation"
);
assert.match(readerSource, /if \(state\[room\.sourceHash\]\)/);

console.log("Controlled Zalo staging tests passed.");
