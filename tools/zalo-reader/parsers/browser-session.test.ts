import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { connectReaderBrowser, ensureReaderBrowser, getReaderZaloPage, isZaloPage, readerProfile, openReaderZalo } from "../browser-session";

async function main() {
  const root = path.resolve(".zalo-reader/offline-browser-session", randomUUID());
  const profile = readerProfile(root);
  fs.mkdirSync(profile, { recursive: true });
  assert.equal(await connectReaderBrowser(profile), null);
  assert.equal(isZaloPage("https://chat.zalo.me/"), true);
  assert.equal(isZaloPage("https://chat.zalo.me.evil.test/"), false);
  const host = await chromium.launchPersistentContext(profile, {
    headless: true, args: ["--enable-automation", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  });
  try {
    // The test never contacts Zalo or accesses the real Reader profile.
    await host.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<h1>Offline Zalo fixture</h1>" }));
    const page = host.pages()[0];
    await page.goto("https://chat.zalo.me/");
    await page.evaluate(() => localStorage.setItem("fixture-session", "same-session"));
    let starts = 0;
    await ensureReaderBrowser(root, async () => { starts++; });
    assert.equal(starts, 0, "an existing reader browser must not start another task");
    for (let attempt = 0; attempt < 2; attempt++) {
      const browser = await connectReaderBrowser(profile);
      assert.ok(browser);
      const shared = await getReaderZaloPage(browser.contexts()[0]);
      assert.equal(await shared.evaluate(() => localStorage.getItem("fixture-session")), "same-session");
      await browser.close();
      assert.equal(host.browser()?.isConnected(), true, "finishing a scan disconnects without closing the admin window");
    }
    await openReaderZalo(root);
    await openReaderZalo(root);
    assert.equal(host.pages().length, 1, "repeated Open reuses the existing Zalo tab");
    assert.equal(await page.evaluate(() => localStorage.getItem("fixture-session")), "same-session");
    const otherProfile = path.join(root, "wrong-profile");
    fs.mkdirSync(otherProfile);
    fs.copyFileSync(path.join(profile, "DevToolsActivePort"), path.join(otherProfile, "DevToolsActivePort"));
    await assert.rejects(connectReaderBrowser(otherProfile), /PROFILE_MISMATCH/);
    assert.equal(host.browser()?.isConnected(), true, "rejecting another profile must not close its browser");
    console.log("Shared Zalo browser: exact profile, same tab/session, repeat Open, disconnect preserves window, wrong-profile rejection PASS (offline)");
  } finally { await host.close(); }
  assert.equal(await connectReaderBrowser(profile), null, "closed browser/stale port file is not reused");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
