import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { messageTimestamp } from "./utils";
import {
  filterMessagesForPreview,
  isReaderImportAllowed,
  PHASE5_PREVIEW_GROUP_NAME,
  PREVIEW_LOGIN_WAIT_MS,
  sanitizePreviewText,
  waitForUiReady,
} from "./phase5-preview";
import {
  isExactGroupNameMatch,
  parseAllowedGroupsJson,
} from "../../../lib/zalo-import/group-allowlist";
import { readZaloAutoImportSettings } from "../../../lib/zalo-import/quality";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 28, 11, 0, 0);
const CUTOFF = T0 - 24 * HOUR;

function message(id: string, sendDttm?: unknown, extra: Record<string, unknown> = {}) {
  return {
    msgId: id,
    text: `listing ${id}`,
    sendDttm,
    ...extra,
  };
}

const candidates = [
  message("cutoff", CUTOFF),
  message("before-cutoff", CUTOFF - 1),
  message("at-t0", T0),
  message("after-t0", T0 + 1),
  message("missing"),
  message("cli-only", undefined, { cliMsgId: String(T0) }),
  message("approx-only", undefined, { domHydration: { approxTimestamp: T0 } }),
  message("seconds", Math.floor(T0 / 1000)),
  message("microseconds", T0 * 1000),
  message("nonnumeric", "not-a-timestamp"),
  message("conflict", T0, { serverTime: T0 - 1000 }),
];

const filtered = filterMessagesForPreview(candidates, T0);
assert.deepEqual(
  filtered.messages.map((item) => item.msgId),
  ["cutoff", "at-t0"]
);
assert.equal(filtered.cutoffMs, CUTOFF);
assert.equal(filtered.endMs, T0);
assert.equal(filtered.decisions[1]?.timestamp.exclusionReason, "outside_24_hour_window_before_cutoff");
assert.equal(filtered.decisions[3]?.timestamp.exclusionReason, "after_reader_start_time");
assert.equal(filtered.decisions[4]?.timestamp.exclusionReason, "missing_or_untrusted_timestamp");
assert.equal(filtered.decisions[5]?.timestamp.exclusionReason, "missing_or_untrusted_timestamp");
assert.equal(filtered.decisions[6]?.timestamp.exclusionReason, "missing_or_untrusted_timestamp");
assert.equal(filtered.decisions[7]?.timestamp.exclusionReason, "invalid_timestamp_unit_or_value");
assert.equal(filtered.decisions[8]?.timestamp.exclusionReason, "invalid_timestamp_unit_or_value");
assert.equal(filtered.decisions[9]?.timestamp.exclusionReason, "invalid_timestamp_unit_or_value");
assert.equal(filtered.decisions[10]?.timestamp.exclusionReason, "conflicting_message_timestamps");

assert.equal(
  messageTimestamp({
    msgId: "id-only",
    cliMsgId: String(T0),
    sendDttm: 0,
    serverTime: 0,
    msgType: 1,
    kind: "text",
    text: "",
    imageUrls: [],
    groupLayoutId: null,
    imageIndex: null,
    totalImages: null,
    fromUid: "",
    toUid: "",
    senderName: "",
    originMsgType: "",
    videoUrls: [],
    videoThumbUrls: [],
    domHydration: { order: 0, approxTimestamp: T0 },
    strictTimestampOnly: true,
  }),
  0
);

assert.equal(
  isExactGroupNameMatch(PHASE5_PREVIEW_GROUP_NAME, PHASE5_PREVIEW_GROUP_NAME),
  true
);
assert.equal(
  isExactGroupNameMatch("Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠 Mới", PHASE5_PREVIEW_GROUP_NAME),
  false
);
const jsonGroups = parseAllowedGroupsJson(
  JSON.stringify([PHASE5_PREVIEW_GROUP_NAME])
);
assert.deepEqual(jsonGroups, [PHASE5_PREVIEW_GROUP_NAME]);
assert.equal(isExactGroupNameMatch(jsonGroups?.[0], PHASE5_PREVIEW_GROUP_NAME), true);
assert.deepEqual(parseAllowedGroupsJson("not-json"), []);
assert.equal(
  isExactGroupNameMatch(parseAllowedGroupsJson('["*"]')?.[0], PHASE5_PREVIEW_GROUP_NAME),
  false
);

const envKeys = [
  "ZALO_AUTO_IMPORT_ALLOWED_GROUPS_JSON",
  "ZALO_AUTO_IMPORT_ALLOWED_GROUPS",
  "ZALO_AUTO_IMPORT_ENABLED",
  "ZALO_AUTO_IMPORT_DRY_RUN",
  "ZALO_AUTO_IMPORT_OWNER_ID",
] as const;
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
try {
  process.env.ZALO_AUTO_IMPORT_ALLOWED_GROUPS_JSON = JSON.stringify([
    PHASE5_PREVIEW_GROUP_NAME,
  ]);
  process.env.ZALO_AUTO_IMPORT_ALLOWED_GROUPS = "";
  process.env.ZALO_AUTO_IMPORT_ENABLED = "false";
  process.env.ZALO_AUTO_IMPORT_DRY_RUN = "true";
  process.env.ZALO_AUTO_IMPORT_OWNER_ID = "test-owner";
  assert.equal(readZaloAutoImportSettings(PHASE5_PREVIEW_GROUP_NAME).allowedGroup, true);
  assert.equal(readZaloAutoImportSettings(`${PHASE5_PREVIEW_GROUP_NAME} New`).allowedGroup, false);
} finally {
  for (const key of envKeys) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

assert.equal(isReaderImportAllowed(true, true), false);
assert.equal(isReaderImportAllowed("true", true), false);
assert.equal(isReaderImportAllowed(false, true), true);
assert.equal(isReaderImportAllowed(false, false), false);
assert.equal(
  sanitizePreviewText("token=abc123 https://example.test/pic?a=private"),
  "token=[REDACTED]"
);
assert.equal(sanitizePreviewText("Bearer eyJhbGciOiJIUzI1NiJ9.abc.signature"), "Bearer [REDACTED]");

const readerSource = fs.readFileSync(
  path.join(process.cwd(), "tools/zalo-reader/zalo-reader.before-semantic-parser.ts"),
  "utf8"
).replace(/\r\n/g, "\n");
const readerConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tools/zalo-reader/config.json"), "utf8")
);
assert.equal(readerConfig.previewOnly, true);
assert.equal(readerConfig.selectors.searchBox, "#contact-search-input");
assert.deepEqual(readerConfig.previewOnlyGroupKeys, ["Gio-Hang-Can-Ho-Q1-Q3-Q10"]);
assert.equal(
  readerConfig.groups.find((entry: { key: string }) => entry.key === "Gio-Hang-Can-Ho-Q1-Q3-Q10")?.name,
  PHASE5_PREVIEW_GROUP_NAME
);
const importGate = readerSource.indexOf(
  "isReaderImportAllowed(\n              config.previewOnly"
);
const previewContinue = readerSource.indexOf(
  "if (config.previewOnly) {\n            console.log("
);
const domCollector = readerSource.indexOf("await scrollChatAndCollect(", previewContinue);
const previewStopBlock = readerSource.slice(previewContinue, domCollector);
const batchFunction = readerSource.indexOf("async function sendBatch(");
const batchGuard = readerSource.indexOf("Preview-only safety barrier blocked sendBatch", batchFunction);
const firstBatchMediaWork = readerSource.indexOf("await imageToBase64(", batchFunction);
const firstBatchApiCall = readerSource.indexOf("await fetch(", batchFunction);
const importerFunction = readerSource.indexOf("async function importIndexedDbRoomPreviews(");
const importerGuard = readerSource.indexOf("Preview-only safety barrier blocked IndexedDB import", importerFunction);
const importerBatchCall = readerSource.indexOf("await sendBatch(", importerFunction);
const importInvocation = readerSource.indexOf("await importIndexedDbRoomPreviews(", importGate);
const stateReadBarrier = readerSource.includes("const state = config.previewOnly ? {} : readState();");
const networkCaptureBarrier = readerSource.includes("if (!config.previewOnly) {\n    installNetworkDebug(");
const mainStart = readerSource.indexOf("async function main() {");
const capturedT0 = readerSource.indexOf("const readerStartedAtMs = Date.now();", mainStart);
const configLoad = readerSource.indexOf("const config = readConfig();", mainStart);
const dumpFunction = readerSource.indexOf("async function dumpActiveGroupMessages(");
const domCaptureDecision = readerSource.indexOf("const domScrollCapture: DomMessageScrollCaptureResult = previewOnly", dumpFunction);
const domCaptureCall = readerSource.indexOf("await captureDomMessagesWhileScrollingUp(page, config)", dumpFunction);
const pageGoto = readerSource.indexOf("await page.goto(", mainStart);
const loginWait = readerSource.indexOf("await waitForPreviewLogin(page, config);", pageGoto);
const groupLoop = readerSource.indexOf("for (\n      const groupEntry of", loginWait);
const previewSuccessPause = readerSource.indexOf("Kiểm tra Chrome/kết quả xong, nhấn Enter", loginWait);
const previewErrorPause = readerSource.indexOf("Chrome được giữ mở. Hãy kiểm tra", loginWait);
const successClose = readerSource.indexOf("await context.close();", previewSuccessPause);
const errorClose = readerSource.indexOf("await context.close();", previewErrorPause);

assert.ok(importGate >= 0, "IndexedDB import must be guarded by preview mode.");
assert.ok(importInvocation > importGate, "Import call must stay inside its preview-aware gate.");
assert.ok(previewContinue >= 0 && domCollector > previewContinue, "Preview must stop before DOM import collection.");
assert.doesNotMatch(previewStopBlock, /sendBatch\(|fetch\(|writeState\(|publishPendingRoom\(/);
assert.ok(batchGuard > batchFunction && batchGuard < firstBatchMediaWork && batchGuard < firstBatchApiCall);
assert.ok(importerGuard > importerFunction && importerGuard < importerBatchCall);
assert.equal(stateReadBarrier, true, "Preview must not read or write import state.");
assert.equal(networkCaptureBarrier, true, "Preview must not install request/body capture hooks.");
assert.ok(capturedT0 > mainStart && capturedT0 < configLoad, "T0 must be captured once at Reader entry.");
assert.ok(domCaptureDecision > dumpFunction && domCaptureCall > domCaptureDecision, "Preview must bypass DOM history/blob-media capture.");
assert.equal(PREVIEW_LOGIN_WAIT_MS, 120_000);
assert.ok(pageGoto > mainStart && loginWait > pageGoto && groupLoop > loginWait, "Preview login readiness must be checked before group search.");
assert.ok(readerSource.includes("const visible = await search.isVisible();") && readerSource.includes("const enabled = await search.isEnabled();"));
assert.ok(previewSuccessPause >= 0 && successClose > previewSuccessPause, "Successful preview must wait for Enter before closing Chrome.");
assert.ok(previewErrorPause >= 0 && errorClose > previewErrorPause, "Failed preview must wait for Enter before closing Chrome.");

async function testUiReadyWait() {
  let now = 0;
  let probes = 0;
  await waitForUiReady({
    timeoutMs: PREVIEW_LOGIN_WAIT_MS,
    now: () => now,
    probe: async () => ++probes === 3,
    sleep: async (milliseconds) => { now += milliseconds; },
  });
  assert.equal(probes, 3);
  assert.equal(now, 2000);

  now = 0;
  let sleeps = 0;
  await assert.rejects(
    waitForUiReady({
      timeoutMs: PREVIEW_LOGIN_WAIT_MS + 30_000,
      now: () => now,
      probe: async () => false,
      sleep: async (milliseconds) => { now += milliseconds; sleeps += 1; },
    }),
    /sau 120 giây/
  );
  assert.equal(now, PREVIEW_LOGIN_WAIT_MS);
  assert.equal(sleeps, 120);
}

testUiReadyWait()
  .then(() => console.log("Phase 5 local-preview safety, login wait, and 24-hour timestamp smoke tests: PASS"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
