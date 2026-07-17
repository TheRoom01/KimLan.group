import assert from "node:assert/strict";

import { buildSemanticTimelineRooms } from "./index";
import {
  filterMessagesByLookback,
  getMessageTimestampMs,
} from "./phase3-message-lookback";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 18, 12, 0, 0);

function textMessage(
  msgId: string,
  text: string,
  timestamp: number
) {
  return {
    msgId,
    cliMsgId: String(timestamp),
    sendDttm: timestamp,
    serverTime: timestamp,
    kind: "text" as const,
    msgType: 1,
    originMsgType: "chat.text",
    text,
    fromUid: "u1",
  };
}

function imageMessage(
  msgId: string,
  layoutId: string,
  timestamp: number
) {
  return {
    msgId,
    cliMsgId: String(timestamp),
    sendDttm: timestamp,
    serverTime: timestamp,
    kind: "image" as const,
    msgType: 2,
    originMsgType: "chat.photo",
    fromUid: "u1",
    groupLayoutId: layoutId,
    imageIndex: 0,
    totalImages: 1,
    imageUrls: [
      `https://example.com/${msgId}.jpg`,
    ],
  };
}

const messages = [
  textMessage(
    "old-building",
    "10 Nguyễn Trãi Quận 5\nTòa nhà thang máy",
    NOW - 26 * HOUR
  ),
  textMessage(
    "old-room",
    "P101 - 5tr",
    NOW - 25 * HOUR
  ),
  imageMessage(
    "old-room-image",
    "old-layout",
    NOW - 25 * HOUR + 1_000
  ),

  /*
   * Đúng tại mốc 24 giờ phải được giữ.
   */
  textMessage(
    "boundary-building",
    "20 Nguyễn Trãi Quận 5\nTòa nhà thang máy",
    NOW - 24 * HOUR
  ),
  textMessage(
    "new-room",
    "P202 - 6tr",
    NOW - 2 * HOUR
  ),
  imageMessage(
    "new-room-image",
    "new-layout",
    NOW - 2 * HOUR + 1_000
  ),

  /*
   * Không có timestamp: phải loại trong strict mode.
   */
  {
    msgId: "unknown-time",
    kind: "text" as const,
    msgType: 1,
    text: "P303 - 7tr",
  },
];

const filtered = filterMessagesByLookback({
  messages,
  lookbackHours: 24,
  nowMs: NOW,
});

assert.equal(filtered.stats.total, 7);
assert.equal(filtered.stats.included, 3);
assert.equal(filtered.stats.excludedTooOld, 3);
assert.equal(
  filtered.stats.excludedUnknownTimestamp,
  1
);

assert.deepEqual(
  filtered.messages.map((item) => item.msgId),
  [
    "boundary-building",
    "new-room",
    "new-room-image",
  ]
);

const parsedRooms = buildSemanticTimelineRooms({
  groupName: "TEST-PHASE-3",
  groupId: "g1",
  messages: filtered.messages,
});

assert.equal(parsedRooms.length, 1);
assert.match(parsedRooms[0].markerText, /P202/i);
assert.deepEqual(
  parsedRooms[0].imageMessageIds,
  ["new-room-image"]
);
assert.doesNotMatch(
  parsedRooms[0].fullText,
  /P101/i
);

/*
 * Timestamp Unix seconds phải được chuẩn hóa sang milliseconds.
 */
assert.equal(
  getMessageTimestampMs(
    {
      sendDttm:
        Math.floor(
          (NOW - HOUR) / 1000
        ),
    },
    NOW
  ),
  NOW - HOUR
);

console.log(
  "Phase 3 24-hour import lookback regression: PASS"
);
