import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONTROLLED_ZALO_GROUP_ID,
  CONTROLLED_ZALO_GROUP_NAME,
  isControlledZaloTarget,
  selectControlledStagingRooms,
  shouldAutoPublishZaloImport,
  makeTestPendingIdentity,
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
assert.equal(selected.excludedAlreadyImported, 0);

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

const twentyFiveRooms = Array.from({ length: 25 }, (_, index) => ({
  markerMessageId: `message-${index + 1}`,
  markerTimestamp: t0 - index - 1,
  sourceHash: `hash-${index + 1}`,
  room: `P${String(index + 1).padStart(2, "0")}`,
}));
const firstTenImported = new Set(
  twentyFiveRooms.slice(0, 10).map((room) => room.sourceHash)
);
const afterImportedFilter = selectControlledStagingRooms({
  rooms: twentyFiveRooms,
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
  importedSourceHashes: firstTenImported,
});
assert.deepEqual(
  afterImportedFilter.rooms.map((room) => room.sourceHash),
  twentyFiveRooms.slice(10, 20).map((room) => room.sourceHash),
  "ten imported sources are removed before the next ten eligible messages are selected"
);
assert.equal(afterImportedFilter.excludedAlreadyImported, 10);
assert.equal(afterImportedFilter.selectedMessages, 10);
assert.equal(afterImportedFilter.selectedRooms, 10);
assert.equal(afterImportedFilter.limitedMessages, 5);

const allImported = selectControlledStagingRooms({
  rooms: twentyFiveRooms,
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
  importedSourceHashes: new Set(twentyFiveRooms.map((room) => room.sourceHash)),
});
assert.equal(allImported.rooms.length, 0);
assert.equal(allImported.excludedAlreadyImported, 25);
assert.equal(allImported.limitedMessages, 0);

const checkpointBeforeTesting = [...firstTenImported];
for (const allowReimportForTesting of [false, true]) {
  const replay = selectControlledStagingRooms({
    rooms: [...twentyFiveRooms, twentyFiveRooms[0], {
      ...twentyFiveRooms[0], sourceHash: "outside-window", markerMessageId: "old", markerTimestamp: t0 - day - 1,
    }],
    cutoffMs: t0 - day, endMs: t0, maxMessages: 10, maxRooms: 20,
    importedSourceHashes: firstTenImported, allowReimportForTesting,
  });
  assert.deepEqual(replay.rooms.map((room) => room.sourceHash),
    twentyFiveRooms.slice(allowReimportForTesting ? 0 : 10, allowReimportForTesting ? 10 : 20).map((room) => room.sourceHash));
  assert.equal(replay.selectedMessages, 10);
  assert.equal(replay.excludedUntrusted, 1);
  assert.equal(new Set(replay.rooms.map((room) => room.sourceHash)).size, 10);
  assert.deepEqual([...firstTenImported], checkpointBeforeTesting, "testing never modifies the checkpoint set");
}
const replayMultiRooms = selectControlledStagingRooms({
  rooms: Array.from({ length: 11 }, (_, index) => [0, 1].map((room) => ({
    markerMessageId: `test-message-${index}`, markerTimestamp: t0 - index - 1,
    sourceHash: `test-${index}-${room}`,
  }))).flat(),
  cutoffMs: t0 - day, endMs: t0, maxMessages: 10, maxRooms: 20,
  allowReimportForTesting: true,
});
assert.equal(replayMultiRooms.selectedMessages, 10);
assert.equal(replayMultiRooms.selectedRooms, 20);

// Exact reported case: 14 known rooms and one unanchored media review item.
const fourteenImportedRooms = twentyFiveRooms.slice(0, 14);
const fourteenCheckpoint = new Set(fourteenImportedRooms.map((room) => room.sourceHash));
const checkpointSnapshot = [...fourteenCheckpoint];
const unanchoredMedia = {
  markerMessageId: "media-only", markerTimestamp: t0,
  sourceHash: "unanchored-photo", warnings: ["NO_ROOM_MARKER", "ROOM_MARKER_MISSING"],
};
for (const allowReimportForTesting of [true, false]) {
  const selection = selectControlledStagingRooms({
    rooms: [...fourteenImportedRooms, unanchoredMedia],
    cutoffMs: t0 - day, endMs: t0, maxMessages: 10, maxRooms: 20,
    importedSourceHashes: fourteenCheckpoint, allowReimportForTesting,
  });
  assert.equal(selection.selectedImportedRooms, allowReimportForTesting ? 10 : 0);
  assert.equal(selection.selectedNewRooms, 0);
  assert.equal(selection.selectedMessages, allowReimportForTesting ? 10 : 0);
  assert.equal(selection.selectedRooms, allowReimportForTesting ? 10 : 0);
  assert.equal(selection.excludedAlreadyImported, allowReimportForTesting ? 0 : 14);
  assert.equal(selection.excludedUnanchored, 1);
  assert.equal(selection.limitedMessages, allowReimportForTesting ? 4 : 0);
  assert.ok(!selection.rooms.some((room) => room.sourceHash === "unanchored-photo"));
  assert.deepEqual([...fourteenCheckpoint], checkpointSnapshot);
}
const mixedSelection = selectControlledStagingRooms({
  rooms: fourteenImportedRooms, cutoffMs: t0 - day, endMs: t0,
  maxMessages: 10, maxRooms: 20, importedSourceHashes: firstTenImported,
});
assert.equal(mixedSelection.selectedImportedRooms, 0);
assert.equal(mixedSelection.selectedNewRooms, 4);

const oldRoomNewMessage = selectControlledStagingRooms({
  rooms: [
    {
      markerMessageId: "old-message",
      markerTimestamp: t0 - 2,
      sourceHash: "old-source-hash",
      roomCode: "503",
    },
    {
      markerMessageId: "new-message",
      markerTimestamp: t0 - 1,
      sourceHash: "new-source-hash",
      roomCode: "503",
    },
  ],
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
  importedSourceHashes: new Set(["old-source-hash"]),
});
assert.deepEqual(
  oldRoomNewMessage.rooms.map((room) => room.markerMessageId),
  ["new-message"],
  "a new Zalo source for the same room remains eligible for room-level duplicate handling"
);

const partiallyImportedMultiRoomMessage = selectControlledStagingRooms({
  rooms: [
    {
      markerMessageId: "multi-source",
      markerTimestamp: t0 - 1,
      sourceHash: "multi-imported",
      room: "A",
    },
    {
      markerMessageId: "multi-source",
      markerTimestamp: t0 - 1,
      sourceHash: "multi-new",
      room: "B",
    },
  ],
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
  importedSourceHashes: new Set(["multi-imported"]),
});
assert.deepEqual(
  partiallyImportedMultiRoomMessage.rooms.map((room) => room.room),
  ["B"],
  "one imported room does not suppress another room from the same source message"
);
assert.equal(partiallyImportedMultiRoomMessage.selectedMessages, 1);

const exactStagingCaps = selectControlledStagingRooms({
  rooms: Array.from({ length: 11 }, (_, messageIndex) =>
    Array.from({ length: 2 }, (_, roomIndex) => ({
      markerMessageId: `cap-message-${messageIndex}`,
      markerTimestamp: t0 - messageIndex - 1,
      sourceHash: `cap-hash-${messageIndex}-${roomIndex}`,
    }))
  ).flat(),
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
});
assert.equal(exactStagingCaps.selectedMessages, 10);
assert.equal(exactStagingCaps.selectedRooms, 20);
assert.equal(exactStagingCaps.limitedMessages, 1);

const duplicateSourceHash = selectControlledStagingRooms({
  rooms: [
    {
      markerMessageId: "duplicate-message",
      markerTimestamp: t0 - 1,
      sourceHash: "same-source-hash",
    },
    {
      markerMessageId: "duplicate-message",
      markerTimestamp: t0 - 1,
      sourceHash: "same-source-hash",
    },
  ],
  cutoffMs: t0 - day,
  endMs: t0,
  maxMessages: 10,
  maxRooms: 20,
});
assert.equal(duplicateSourceHash.rooms.length, 1);
assert.equal(duplicateSourceHash.excludedDuplicateSources, 1);

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
// Source filtering is verified through selector inputs/results, including the
// new-source-only test mode, rather than matching the Reader's exact if text.
assert.equal(typeof config.allowReimportForTesting, "boolean");
assert.equal(config.testImportToPending, false, "Pending test stays off by default");
const testIdentity = makeTestPendingIdentity("group-1", "source-1");
assert.deepEqual(testIdentity, makeTestPendingIdentity("group-1", "source-1"));
assert.notEqual(testIdentity.pendingId, makeTestPendingIdentity("group-1", "source-2").pendingId);
assert.notEqual(testIdentity.batchId, testIdentity.pendingId);
assert.match(testIdentity.pendingId, /^[a-f0-9-]{36}$/);
const pendingSelection = selectControlledStagingRooms({
  rooms: twentyFiveRooms, cutoffMs: t0 - day, endMs: t0,
  maxMessages: 20, maxRooms: 20, testImportToPending: true,
  importedSourceHashes: new Set(twentyFiveRooms.map((room) => room.sourceHash)),
});
assert.equal(pendingSelection.selectedRooms, 10);
assert.equal(pendingSelection.selectedImportedRooms, 10);
const newSourceTestSelection = selectControlledStagingRooms({
  rooms: twentyFiveRooms, cutoffMs: t0 - day, endMs: t0,
  maxMessages: 20, maxRooms: 20, testImportToPending: true, testNewSourcesOnly: true,
  importedSourceHashes: new Set(twentyFiveRooms.slice(0, 10).map(room => room.sourceHash)),
});
assert.equal(newSourceTestSelection.selectedImportedRooms, 0);
assert.equal(newSourceTestSelection.selectedRooms, 10);
assert.equal(newSourceTestSelection.excludedAlreadyImported, 10);
assert.match(serviceSource, /testImportToPending && uploadedImages\.length === 0 && uploadedVideos\.length === 0/);
assert.match(serviceSource, /!testImportToPending && shouldAutoPublishZaloImport/);
assert.match(serviceSource, /eq\("room_payload->>is_test_import", "true"\)/);
const pendingResultGuard = readerSource.indexOf("if (config.testImportToPending) {", readerSource.indexOf("if (result?.testingOnly)"));
assert.match(readerSource.slice(pendingResultGuard, pendingResultGuard + 340), /continue;/);
const sendStart = readerSource.indexOf("async function sendBatch(");
const testStart = readerSource.indexOf("if (config.allowReimportForTesting) {", sendStart);
const testEnd = readerSource.indexOf("let importPayload =", testStart);
const testBlock = readerSource.slice(testStart, testEnd);
assert.ok(testStart > sendStart && testEnd > testStart);
assert.match(testBlock, /testingOnly: true/);
assert.match(testBlock, /return result;/);
assert.doesNotMatch(testBlock, /writeState\(|supabase|uploadBufferToR2|fetch\(endpoint/);
const testResultGuard = readerSource.indexOf("if (result?.testingOnly)");
assert.ok(testResultGuard < readerSource.indexOf("state[room.sourceHash] =", testResultGuard));
assert.match(readerSource.slice(testResultGuard, testResultGuard + 110), /continue;/);

console.log("Controlled Zalo staging tests passed.");
