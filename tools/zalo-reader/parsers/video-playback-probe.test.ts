import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { markVideoProbeTarget, sniffVideoContainer, VIDEO_OBJECT_OBSERVER, VIDEO_PROBE_TARGETS } from "../video-playback-probe";

assert.equal(VIDEO_PROBE_TARGETS.length, 2);
assert.deepEqual(VIDEO_PROBE_TARGETS.map(target => target.room), ["402", "503"]);
assert.equal(sniffVideoContainer(Buffer.from("0000ftypisom")), "video/mp4");
assert.equal(sniffVideoContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), "video/webm");
assert.equal(sniffVideoContainer(Buffer.from("<html>not a video")), null);
assert.equal(sniffVideoContainer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), null);
class FakeBlob { constructor(readonly type: string, readonly size: number) {} }
class FakeMediaSource {}
let objectNumber = 0;
const sandbox = { URL: { createObjectURL: (_value?: unknown) => `blob:fixture-${++objectNumber}` }, Blob: FakeBlob, MediaSource: FakeMediaSource };
vm.runInNewContext(VIDEO_OBJECT_OBSERVER, sandbox);
const blobUrl = sandbox.URL.createObjectURL(new FakeBlob("video/mp4", 77) as never);
const streamUrl = sandbox.URL.createObjectURL(new FakeMediaSource() as never);
const observed = (sandbox as unknown as { __readerVideoObjectKinds: Map<string, { kind: string }> }).__readerVideoObjectKinds;
assert.equal(observed.get(blobUrl)?.kind, "blob");
assert.equal(observed.get(streamUrl)?.kind, "media-source");

// Offline DOM fixture: Zalo repeats the message ID on its reaction widget.
// The video poster can be a CSS background, so clicking the first img is wrong.
class FixtureElement {
  attributes: { value: string }[];
  marked = "";
  constructor(readonly tagName: string, readonly className: string, readonly width: number, readonly height: number,
    id = "", readonly children: FixtureElement[] = [], readonly backgroundImage = "none", readonly top = 100) {
    this.attributes = id ? [{ value: id }] : [];
  }
  getBoundingClientRect() { return { left: 100, right: 100 + this.width, top: this.top, bottom: this.top + this.height, width: this.width, height: this.height }; }
  querySelectorAll() { return this.children; }
  matches() { return this.tagName === "IMG" || this.tagName === "VIDEO"; }
  setAttribute(_name: string, value: string) { this.marked = value; }
}
const target = VIDEO_PROBE_TARGETS[0];
const reactionImage = new FixtureElement("IMG", "default-react-icon-thumb", 24, 24);
const reaction = new FixtureElement("DIV", "", 28, 28, target.videoMessageId, [reactionImage]);
const poster = new FixtureElement("DIV", "video-poster", 180, 310, "", [], "url(blob:fixture)");
const message = new FixtureElement("DIV", "message", 220, 340, `msg-${target.cliMsgId}`, [reactionImage, poster]);
const other = new FixtureElement("DIV", "message", 220, 340, "8432999999999", [poster]);
const domSandbox = { __name: (value: unknown) => value, document: { querySelectorAll: () => [reaction, other, message] },
  innerHeight: 900, innerWidth: 1400, getComputedStyle: (element: FixtureElement) => ({ display: "block", visibility: "visible", opacity: "1", backgroundImage: element.backgroundImage }), target };
const selected = vm.runInNewContext(`(${markVideoProbeTarget.toString()})(target)`, domSandbox);
assert.equal(selected.surfaceTag, "div");
assert.equal(selected.width, 180);
assert.equal(message.marked, target.videoMessageId);
assert.equal(reaction.marked, "");
assert.equal(other.marked, "");
assert.equal(vm.runInNewContext(`(${markVideoProbeTarget.toString()})(target)`, { ...domSandbox, document: { querySelectorAll: () => [reaction, other] } }), null);
const reader = fs.readFileSync(path.resolve(__dirname, "../zalo-reader.before-semantic-parser.ts"), "utf8");
assert.match(reader, /Video playback probe requires local testing only/);
const noWrite = reader.indexOf('console.log("Video probe hoàn tất;');
assert.ok(noWrite > 0);
assert.match(reader.slice(noWrite, noWrite + 180), /continue;/);
console.log("Video playback source/Blob/MediaSource and no-write barriers: PASS");
