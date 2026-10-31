import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { isDownloadableZaloVideoUrl } from "./parsers/utils";

export const VIDEO_PROBE_TARGETS = [
  { room: "402", sourceMessageId: "8432817678744", videoMessageId: "8432817962467", cliMsgId: "1793350367990" },
  { room: "503", sourceMessageId: "8432674799200", videoMessageId: "8432675501467", cliMsgId: "1793348452757" },
];

export function sniffVideoContainer(bytes: Buffer) {
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

// Observe only the kind of object passed to the browser's normal object-URL API.
// Keep behavior unchanged; never inspect credentials, decryption material or media keys.
export const VIDEO_OBJECT_OBSERVER = `(() => {
  const original = URL.createObjectURL.bind(URL);
  const observed = new Map();
  globalThis.__readerVideoObjectKinds = observed;
  URL.createObjectURL = function(value) {
    const url = original(value);
    observed.set(url, {
      kind: typeof MediaSource !== 'undefined' && value instanceof MediaSource ? 'media-source' : value instanceof Blob ? 'blob' : 'other',
      mime: value instanceof Blob ? value.type : '',
      size: value instanceof Blob ? value.size : null
    });
    return url;
  };
})();`;

type Snapshot = { idCandidates: string[]; videoUrls: string[] };

// Runs in the page. A message ID can also occur on a small reaction control;
// require a visible media surface instead of choosing that smallest ID node.
export function markVideoProbeTarget({ videoMessageId, cliMsgId }: { videoMessageId: string; cliMsgId: string }) {
  const visible = (element: Element, minimum: number) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return Math.min(rect.right, innerWidth) - Math.max(rect.left, 0) >= minimum &&
      Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0) >= minimum &&
      style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  };
  const candidates = Array.from(document.querySelectorAll("[id], [data-id], [data-msg-id], [data-message-id], [data-qid]")).flatMap(element => {
    if (!visible(element, 70) || !Array.from(element.attributes).some(attribute =>
      [videoMessageId, cliMsgId].some(id => attribute.value.match(/\d{12,16}/g)?.includes(id)))) return [];
    const surfaces = [element, ...Array.from(element.querySelectorAll("img,video,[style*='background-image']"))].filter(surface => {
      if (!visible(surface, 70)) return false;
      if (/avatar|reaction|emoji|sticker|icon/i.test(String(surface.className))) return false;
      return surface.matches("img,video") || getComputedStyle(surface).backgroundImage.startsWith("url(");
    }).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    return surfaces[0] ? [{ element, surface: surfaces[0] }] : [];
  }).sort((a, b) => a.element.getBoundingClientRect().width * a.element.getBoundingClientRect().height - b.element.getBoundingClientRect().width * b.element.getBoundingClientRect().height);
  const selected = candidates[0];
  if (!selected) return null;
  selected.element.setAttribute("data-reader-video-probe", videoMessageId);
  const media = selected.surface.getBoundingClientRect();
  // Click the visible part of the actual thumbnail, including its play overlay.
  const x = (Math.max(media.left, 0) + Math.min(media.right, innerWidth)) / 2;
  const y = (Math.max(media.top, 0) + Math.min(media.bottom, innerHeight)) / 2;
  return { tag: selected.element.tagName.toLowerCase(), surfaceTag: selected.surface.tagName.toLowerCase(),
    width: media.width, height: media.height, point: { x, y } };
}

export async function clickVideoProbeThumbnail(page: Page, point: { x: number; y: number }) {
  // The play overlay is often a sibling of img. A locator click on img waits
  // forever for that overlay to disappear; a normal pointer click opens it.
  await page.mouse.click(point.x, point.y);
}

export function createVideoPlaybackProbe(page: Page, directory: string) {
  const attempted = new Set<string>();
  const reports: Array<Record<string, unknown>> = [];
  fs.mkdirSync(directory, { recursive: true });
  const persist = () => fs.writeFileSync(path.join(directory, "video-playback-report.json"), JSON.stringify({ pendingWritten: false, reports }, null, 2));

  async function inspect(items: Snapshot[]) {
    for (const target of VIDEO_PROBE_TARGETS) {
      if (attempted.has(target.videoMessageId) || !items.some(item => item.idCandidates.some(id => id === target.videoMessageId || id === target.cliMsgId))) continue;
      attempted.add(target.videoMessageId);
      const report: Record<string, unknown> = { ...target, opened: false, played: false, saved: false, stage: "locate" };
      reports.push(report);
      try {
        const bubble = await page.evaluate(markVideoProbeTarget, target);
        report.bubble = bubble;
        if (!bubble) { report.reason = "TARGET_BUBBLE_NOT_VISIBLE"; continue; }
        await page.screenshot({ path: path.join(directory, `${target.room}-before.png`) });
        report.stage = "open";
        await clickVideoProbeThumbnail(page, bubble.point);
        report.opened = true;
        try { await page.locator("video:visible").first().waitFor({ state: "visible", timeout: 15000 }); } catch {
          await page.screenshot({ path: path.join(directory, `${target.room}-after-open.png`) });
          report.reason = "NO_VIDEO_ELEMENT_AFTER_UI_CLICK"; continue;
        }
        const videos = page.locator("video:visible");
        if (await videos.count() !== 1) { report.reason = "AMBIGUOUS_VISIBLE_VIDEO_ELEMENTS"; continue; }
        const video = videos.first();
        report.stage = "play";
        const before = await video.evaluate((element: HTMLVideoElement) => ({ time: element.currentTime, paused: element.paused }));
        if (before.paused) {
          // A normal play overlay may intercept clicks addressed to the video tag.
          const bounds = await video.boundingBox();
          if (bounds) await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        }
        await page.waitForTimeout(6000);
        const observed = await video.evaluate((element: HTMLVideoElement) => {
          const source = element.currentSrc || element.getAttribute("src") || element.querySelector("source")?.getAttribute("src") || "";
          const object = (globalThis as unknown as { __readerVideoObjectKinds?: Map<string, { kind: string; mime: string; size: number }> }).__readerVideoObjectKinds?.get(source);
          return { source, kind: element.srcObject ? typeof MediaStream !== "undefined" && element.srcObject instanceof MediaStream ? "media-stream" : "src-object-unknown" : source.startsWith("blob:") ? object?.kind || "blob-unknown" : source.startsWith("https:") ? "https" : "none",
            srcObjectType: element.srcObject ? Object.prototype.toString.call(element.srcObject) : null,
            objectMime: object?.mime || "", objectSize: object?.size || null, time: element.currentTime, duration: Number.isFinite(element.duration) ? element.duration : null,
            paused: element.paused, readyState: element.readyState, networkState: element.networkState, width: element.videoWidth, height: element.videoHeight,
            errorCode: element.error?.code || null, encryptedMedia: element.mediaKeys !== null };
        });
        const { source, ...safeObserved } = observed;
        report.sourceHost = observed.kind === "https" ? new URL(source).hostname : null;
        report.playback = safeObserved;
        report.played = observed.time > before.time + 0.25 && observed.readyState >= 2;
        await page.screenshot({ path: path.join(directory, `${target.room}-player.png`) });
        const buttons = await page.locator("button,[role=button],[title],[aria-label]").evaluateAll(elements => elements.map(element => ({ name: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || "", title: element.getAttribute("title"), aria: element.getAttribute("aria-label"), visible: element.getBoundingClientRect().width > 0 })).filter(button => button.visible && button.name.length < 120 && /download|tải|đóng|close|play|phát/i.test(button.name)));
        report.playerButtons = buttons;
        if (observed.encryptedMedia) { report.reason = "PROTECTED_MEDIA_DO_NOT_EXTRACT"; continue; }
        report.stage = "save";
        const downloadButtons = buttons.filter(button => /^(Tải xuống|Download)(?:\s*\([^)]*\))?$/i.test(button.name));
        if (report.played && downloadButtons.length === 1) {
          const button = downloadButtons[0];
          const locator = button.aria ? page.locator(`[aria-label=${JSON.stringify(button.aria)}]`) : button.title ? page.locator(`[title=${JSON.stringify(button.title)}]`) : page.getByRole("button", { name: button.name, exact: true });
          if (await locator.count() === 1) {
            try {
              const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), locator.click({ timeout: 5000 })]);
              const temporary = path.join(directory, `${target.videoMessageId}.download`);
              await download.saveAs(temporary);
              const bytes = fs.readFileSync(temporary);
              const mime = sniffVideoContainer(bytes);
              if (mime && bytes.length <= 100 * 1024 * 1024) {
                const file = path.join(directory, `${target.videoMessageId}.${mime === "video/webm" ? "webm" : "mp4"}`);
                fs.renameSync(temporary, file);
                Object.assign(report, { saved: true, saveMethod: "normal-ui-download", localFile: file, mimeType: mime, bytes: bytes.length });
                continue;
              }
              report.downloadWarning = "UI_DOWNLOAD_NOT_VALID_VIDEO_CONTAINER";
            } catch { report.downloadWarning = "NORMAL_UI_DOWNLOAD_UNAVAILABLE"; }
          }
        }
        if (observed.kind === "https" && isDownloadableZaloVideoUrl(source)) {
          const response = await page.context().request.get(source, { timeout: 60000, maxRedirects: 0 });
          try {
            if (!response.ok() || !String(response.headers()["content-type"] || "").startsWith("video/") || Number(response.headers()["content-length"] || 0) > 100 * 1024 * 1024) throw new Error("DIRECT_SOURCE_NOT_DOWNLOADABLE");
            const bytes = await response.body();
            const mime = sniffVideoContainer(bytes);
            if (!mime || bytes.length > 100 * 1024 * 1024) throw new Error("DIRECT_SOURCE_INVALID_CONTAINER");
            const file = path.join(directory, `${target.videoMessageId}.${mime === "video/webm" ? "webm" : "mp4"}`);
            fs.writeFileSync(file, bytes);
            Object.assign(report, { saved: true, saveMethod: "ui-provided-https", localFile: file, mimeType: mime, bytes: bytes.length });
            for (const item of items.filter(item => item.idCandidates.includes(target.videoMessageId) || item.idCandidates.includes(target.cliMsgId))) item.videoUrls = [source];
          } finally { await response.dispose(); }
        } else if (observed.kind === "blob" && observed.objectMime.startsWith("video/") && Number(observed.objectSize) <= 100 * 1024 * 1024) {
          const payload = await video.evaluate(async (element: HTMLVideoElement) => {
            const response = await fetch(element.currentSrc, { signal: AbortSignal.timeout(30000) });
            const blob = await response.blob();
            if (!response.ok || !blob.type.startsWith("video/") || blob.size > 100 * 1024 * 1024) return null;
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
            return btoa(binary);
          });
          if (payload) {
            const bytes = Buffer.from(payload, "base64");
            const mime = sniffVideoContainer(bytes);
            if (mime) {
              const file = path.join(directory, `${target.videoMessageId}.${mime === "video/webm" ? "webm" : "mp4"}`);
              fs.writeFileSync(file, bytes);
              Object.assign(report, { saved: true, saveMethod: "browser-blob", localFile: file, mimeType: mime, bytes: bytes.length });
            } else report.reason = "BLOB_NOT_A_VIDEO_CONTAINER";
          } else report.reason = "BLOB_NOT_READABLE_OR_INVALID_MIME";
        } else report.reason = observed.kind === "media-source" ? "MEDIA_SOURCE_REQUIRES_NORMAL_UI_DOWNLOAD" : observed.kind === "media-stream" ? "MEDIA_STREAM_HAS_NO_DIRECT_FILE" : "NO_DOWNLOADABLE_UI_SOURCE";
      } catch (error) {
        report.reason = "PLAYBACK_PROBE_FAILED";
        report.errorType = error instanceof Error ? error.name : "unknown";
      } finally {
        // Return from the media viewer only, without switching chats or sending messages.
        if (report.opened) await page.keyboard.press("Escape").catch(() => {});
        persist();
        console.log("Video playback probe:", JSON.stringify(report));
      }
    }
  }
  return { inspect, attempted };
}
