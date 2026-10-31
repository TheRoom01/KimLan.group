import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { waitForTerminalEnter } from "../terminal-wait";
import { buildMediaReport } from "../../../lib/zalo-reader/media-report";

async function main() {
  const output = new PassThrough();
  let printed = "";
  output.on("data", (chunk) => { printed += String(chunk); });
  assert.equal(await waitForTerminalEnter("wait", new PassThrough(), output), "non-interactive");
  assert.match(printed, /stdin/);

  const input = Object.assign(new PassThrough(), { isTTY: true });
  let resolved = false;
  const waiting = waitForTerminalEnter("wait", input, output).then((reason) => {
    resolved = true;
    return reason;
  });
  input.write("not enter alone\n");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false, "interactive wait does not close before an empty Enter line");
  input.write("\n");
  assert.equal(await waiting, "enter");

  const eofInput = Object.assign(new PassThrough(), { isTTY: true });
  const eof = waitForTerminalEnter("wait", eofInput, output);
  eofInput.end();
  assert.equal(await eof, "stdin-ended");

  const errorInput = Object.assign(new PassThrough(), { isTTY: true });
  const errorWait = waitForTerminalEnter("wait", errorInput, output);
  errorInput.emit("error", new Error("fixture"));
  assert.equal(await errorWait, "stdin-error");

  const report = buildMediaReport({
    sourceMessageId: "12345", expectedImages: 8, expectedVideos: 1,
    downloadedImages: 8, submittedImages: 8, submittedVideos: 0,
    response: {
      pendingVersionId: "pending-1", imageCount: 8, videoCount: 0,
      partial: true, mediaProgress: { imagesUploaded: 8, videosDownloaded: 0, videosUploaded: 0 },
      rawText: "PRIVATE-TEXT", cookie: "PRIVATE-COOKIE", videoUrls: ["https://example.test/?token=SECRET"],
      issues: [{ level: "error", stage: "reader", message: "không lấy được sourceUrl video https://example.test/?token=SECRET" }],
    },
  });
  assert.equal(report.pending, "created");
  assert.equal(report.saved.images, 8);
  assert.equal(report.downloaded.videos, 0);
  assert.deepEqual(report.errorCodes, ["VIDEO_SOURCE_MISSING"]);
  const emptyMedia = buildMediaReport({ sourceMessageId: "402", expectedImages: 0, expectedVideos: 1, downloadedImages: 0, submittedImages: 0, submittedVideos: 0,
    response: { issues: [{ level: "error", stage: "reader", message: "Reader không tìm thấy ảnh hoặc video cho phòng này." }] } });
  assert.deepEqual(emptyMedia.errorCodes, ["MEDIA_SOURCE_MISSING"]);
  assert.doesNotMatch(JSON.stringify(report), /SECRET|https|PRIVATE/);
  const unknown = buildMediaReport({ sourceMessageId: "2", expectedImages: 0, expectedVideos: 1, downloadedImages: 0, submittedImages: 0, submittedVideos: 1, response: { duplicate: true } });
  assert.equal(unknown.pending, "existing-source");
  const unchanged = buildMediaReport({ sourceMessageId: "new-source", expectedImages: 1, expectedVideos: 0, downloadedImages: 1,
    submittedImages: 1, submittedVideos: 0, response: { noChanges: true, imageCount: 0, videoCount: 0 } });
  assert.equal(unchanged.pending, "not-created-unchanged");
  assert.equal(unchanged.partial, false);
  assert.equal(unknown.downloaded.videos, null, "missing server progress must not be reported as zero");
  const tested = buildMediaReport({
    sourceMessageId: "old-source", expectedImages: 8, expectedVideos: 1,
    downloadedImages: 8, submittedImages: 0, submittedVideos: 0,
    response: { testingOnly: true, imageCount: 0, videoCount: 0,
      mediaProgress: { videosDownloaded: 1, imagesUploaded: 0, videosUploaded: 0 } },
  });
  assert.equal(tested.pending, "not-created-test");
  assert.deepEqual(tested.saved, { images: 0, videos: 0 });
  assert.deepEqual(tested.downloaded, { images: 8, videos: 1 });
  console.log("Terminal wait / sanitized media report regressions: PASS");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
