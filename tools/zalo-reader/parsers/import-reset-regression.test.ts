import assert from "node:assert/strict";
import { buildSemanticTimelineRooms } from "./index";
import { parseZaloRoomText } from "../../../lib/zalo-import/parser";
import { selectControlledStagingRooms } from "../../../lib/zalo-reader/controlled-staging";
import type { SemanticIndexedDbMessage } from "./types";

function text(id: string, value: string, time: number): SemanticIndexedDbMessage {
  return {
    msgId: id, cliMsgId: id, kind: "text", msgType: 1, text: value,
    sendDttm: time, serverTime: time, fromUid: "fixture", toUid: "g1",
    senderName: "Fixture", originMsgType: "chat.text", imageUrls: [],
    videoUrls: [], videoThumbUrls: [], groupLayoutId: null,
    imageIndex: null, totalImages: null,
  };
}
function photo(index: number, album: boolean): SemanticIndexedDbMessage {
  return {
    ...text(`photo-${index}`, "", 3000 + index), kind: "image", msgType: 3,
    imageUrls: [`https://example.test/${index}.jpg`],
    groupLayoutId: album ? "album-10" : null,
    imageIndex: album ? index : null, totalImages: album ? 10 : null,
  };
}
function preview(marker: string, album: boolean) {
  return buildSemanticTimelineRooms({
    groupName: "Fixture", groupId: "g1",
    messages: [
      text("building", "360 Nguyễn Thị Minh Khai, Q3", 1000),
      text("room", marker, 2000),
      ...Array.from({ length: 10 }, (_, index) => photo(index, album)),
    ].reverse(),
  });
}
const validMarker = "1PN/CS - 7.500.000 - P.501 - trống 21/11";
for (const album of [true, false]) {
  const rooms = preview(validMarker, album);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].imageMessageIds.length, 10);
  assert.equal(parseZaloRoomText(rooms[0].fullText).roomPayload.room_code, "501");
}

// The captured source has USD pricing unsupported by the current VND parser.
// It remains a single local review item, without guessing a VND price or code.
const usd = "1PN/CS/1PB - $750 - P.5B - trống 21/11";
const review = preview(usd, false);
assert.equal(review.length, 1);
assert.equal(review[0].roomCode, "");
assert.equal(review[0].imageMessageIds.length, 10);
assert.ok(review[0].warnings.includes("ROOM_MARKER_MISSING"));
assert.notEqual(parseZaloRoomText(review[0].fullText).roomPayload.room_code, "21");

const options = { cutoffMs: 0, endMs: 10000, maxMessages: 10, maxRooms: 20 };
assert.equal(selectControlledStagingRooms({ ...options, rooms: review }).rooms.length, 0);
const valid = preview(validMarker, true);
const checkpoint = new Set(valid.map((room) => room.sourceHash));
// Simulate removing import history: the independent checkpoint remains intact.
const importHistory = new Map(valid.map((room) => [room.sourceHash, room]));
importHistory.clear();
assert.equal(importHistory.size, 0);
const replay = preview(validMarker, true);
assert.equal(replay[0].sourceHash, valid[0].sourceHash);
assert.equal(selectControlledStagingRooms({
  ...options, rooms: replay, importedSourceHashes: checkpoint,
}).rooms.length, 0);
assert.equal(checkpoint.size, 1);
console.log("Import reset / unanchored media regressions: PASS");
