import assert from "node:assert/strict";
import { chromium } from "playwright";
import { clickVideoProbeThumbnail, markVideoProbeTarget, VIDEO_PROBE_TARGETS } from "../video-playback-probe";

async function main() {
  // Isolated local HTML only: no Zalo profile, login, media or network access.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.route("**/*", route => route.abort());
    await page.addInitScript("globalThis.__name = globalThis.__name || Object;");
    await page.evaluate("globalThis.__name = globalThis.__name || Object;");
    const target = VIDEO_PROBE_TARGETS[0];
    await page.setContent(`
      <div id="msg-${target.cliMsgId}" style="position:absolute;left:400px;top:100px;width:225px;height:410px">
        <img id="${target.videoMessageId}" style="width:205px;height:366px" alt="local fixture">
        <div id="play-overlay" role="button" aria-label="Phát" style="position:absolute;inset:0;background:#ccc;display:grid;place-items:center"
          onclick="document.body.dataset.playOpened='true'">▶</div>
        <div id="reaction-${target.videoMessageId}" style="width:28px;height:28px"><img class="default-react-icon-thumb" style="width:24px;height:24px"></div>
      </div>`);
    const selected = await page.evaluate(markVideoProbeTarget, target);
    assert.ok(selected);
    assert.equal(selected.tag, "img");
    assert.equal(selected.surfaceTag, "img");
    // Reproduce the real failure before checking the replacement pointer action.
    await assert.rejects(page.locator(`[data-reader-video-probe="${target.videoMessageId}"]`).click({ timeout: 350 }), /Timeout/);
    assert.equal(await page.locator("body").getAttribute("data-play-opened"), null);
    await clickVideoProbeThumbnail(page, selected.point);
    assert.equal(await page.locator("body").getAttribute("data-play-opened"), "true");
    console.log("Offline video thumbnail / sibling play-overlay regression: PASS");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
