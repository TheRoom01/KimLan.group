import assert from "node:assert/strict";
import { runSettledPool } from "../../lib/async-pool";
import { uploadDirect } from "../../lib/media/upload-direct";

async function main() {
  let active = 0, peak = 0, completed = 0;
  await runSettledPool([0, 1, 2, 3, 4, 5], 3, async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--; completed++;
  });
  assert.equal(peak, 3); assert.equal(completed, 6);
  await assert.rejects(runSettledPool([0, 1, 2, 3], 2, async item => {
    active++;
    try { await new Promise(resolve => setTimeout(resolve, item === 0 ? 1 : 20)); if (item === 0) throw new Error("copy failed"); }
    finally { active--; }
  }), /copy failed/);
  assert.equal(active, 0, "rollback starts only after in-flight copies settle");

  let statuses = [503, 200], attempts = 0;
  const headers: Record<string, string> = {};
  const original = globalThis.XMLHttpRequest;
  class FakeXHR {
    status = 0; responseText = "temporary error"; upload = { onprogress: null as null | ((event: {lengthComputable: boolean;loaded: number;total: number}) => void) };
    onload?: () => void; onerror?: () => void; onabort?: () => void;
    open(method: string, url: string) { assert.equal(method, "PUT"); assert.equal(url, "https://r2.test/signed"); }
    setRequestHeader(key: string, value: string) { headers[key] = value; }
    abort() { this.onabort?.(); }
    send() { attempts++; this.status = statuses.shift()!; queueMicrotask(() => { this.upload.onprogress?.({lengthComputable: true, loaded: 50,total:100}); this.onload?.(); }); }
  }
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  try {
    const progress: number[] = [];
    await uploadDirect({ url: "https://r2.test/signed", file: new File(["video"], "clip.mp4"), headers: { "Content-Type": "video/mp4" }, onProgress: percent => progress.push(percent) });
    assert.equal(attempts, 2); assert.equal(headers["Content-Type"], "video/mp4"); assert.deepEqual(progress, [50,50]);
    statuses = [403]; attempts = 0;
    await assert.rejects(uploadDirect({ url: "https://r2.test/signed", file: new File(["video"], "clip.mp4"), headers: {} }), /HTTP 403/);
    assert.equal(attempts, 1, "authorization errors are not retried blindly");
  } finally { globalThis.XMLHttpRequest = original; }
  console.log("Zalo imports: bounded concurrency, safe rollback drain, upload progress and transient retries PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
