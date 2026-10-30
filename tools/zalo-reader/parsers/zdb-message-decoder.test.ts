import assert from "node:assert/strict";
import { decodeZdbMessagePayload, lookupZdbMessageRecord } from "./zdb-message-decoder";
import { filterMessagesForPreview } from "./phase5-preview";

const plainText = decodeZdbMessagePayload("Studio - 11.000.000 - P04 - trống sẵn");
assert.equal(plainText.isJson, false);
assert.equal(plainText.text, "Studio - 11.000.000 - P04 - trống sẵn");

const jsonText = decodeZdbMessagePayload('{"text":"Studio - 9.000.000 - P03"}');
assert.equal(jsonText.isJson, true);
assert.equal(jsonText.text, "Studio - 9.000.000 - P03");

const jsonMedia = decodeZdbMessagePayload('{"oriUrl":"https://images.invalid/room.jpg"}');
assert.equal(jsonMedia.isJson, true);
assert.equal(jsonMedia.text, "");
assert.deepEqual(jsonMedia.value, { oriUrl: "https://images.invalid/room.jpg" });

const calls: string[] = [];
const msgIdRecord = { msgId: "message-primary", cliMsgId: "client-secondary", message: "plain" };
const byMsgId = await lookupZdbMessageRecord({
  msgId: "message-primary",
  cliMsgId: "client-secondary",
  getByMsgId: async (key) => {
    calls.push(`msg:${key}`);
    return key === msgIdRecord.msgId ? msgIdRecord : null;
  },
  getByCliMsgId: async (key) => {
    calls.push(`cli:${key}`);
    return key === msgIdRecord.cliMsgId ? msgIdRecord : null;
  },
});
assert.equal(byMsgId.matchedBy, "msgId");
assert.deepEqual(calls, ["msg:message-primary"], "primary key is tried first without assuming ID equality");

const byCliMsgId = await lookupZdbMessageRecord({
  msgId: "not-the-primary-key",
  cliMsgId: "client-secondary",
  getByMsgId: async () => null,
  getByCliMsgId: async (key) => key === msgIdRecord.cliMsgId ? msgIdRecord : null,
});
assert.equal(byCliMsgId.matchedBy, "cliMsgId", "secondary index is used after msgId misses");

const missing = await lookupZdbMessageRecord({
  msgId: "missing",
  cliMsgId: "also-missing",
  getByMsgId: async () => null,
  getByCliMsgId: async () => null,
});
assert.equal(missing.record, null);
assert.equal(missing.matchedBy, "none");

const t0 = Date.UTC(2026, 9, 28, 11, 0, 0);
const strictWindow = filterMessagesForPreview(
  [
    { msgId: "trusted", sendDttm: t0, serverTime: t0 },
    { msgId: "id-is-not-time", cliMsgId: String(t0), sendDttm: 0, serverTime: 0 },
    { msgId: "dom-is-not-time", sendDttm: 0, serverTime: 0, domHydration: { approxTimestamp: t0 } },
  ],
  t0,
);
assert.deepEqual(strictWindow.messages.map((item) => item.msgId), ["trusted"]);
assert.equal(strictWindow.decisions[1]?.timestamp.status, "missing_or_untrusted_timestamp");
assert.equal(strictWindow.decisions[2]?.timestamp.status, "missing_or_untrusted_timestamp");

console.log("ZDB message decoder regression tests passed.");
