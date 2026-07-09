import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";

type Config = {
  webBaseUrl: string;
  internalSecret: string;
  scanIntervalMs: number;
  maxMessagesPerGroup: number;
  maxImagesPerBatch: number;
  maxFollowingImageMessages: number;
  groups: string[];
  roomTextKeywords: string[];
  selectors: {
    searchBox: string;
    messageItems: string;
    messageText?: string;
    messageSender?: string;
    imageNodes: string;
  };
};

type Msg = {
  text: string;
  senderName: string;
  imageSrcs: string[];
  sourceHash: string;
};

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "tools/zalo-reader/config.json");
const STATE_PATH = path.join(ROOT, "tools/zalo-reader/state.json");
const PROFILE_DIR = path.join(ROOT, ".zalo-reader/profile");

function loadDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readConfig(): Config {
  loadDotEnvLocal();

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  config.webBaseUrl =
    process.env.ZALO_READER_WEB_BASE_URL ||
    config.webBaseUrl;

  config.internalSecret =
    process.env.ZALO_READER_INTERNAL_SECRET ||
    config.internalSecret;

  if (!config.internalSecret) {
    throw new Error("Missing ZALO_READER_INTERNAL_SECRET");
  }

  return config;
}

function readState(): Record<string, true> {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeState(state: Record<string, true>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isRoomText(text: string, keywords: string[]) {
  const s = text.toLowerCase();
  return keywords.some((k) => s.includes(k.toLowerCase()));
}

async function openGroup(page: Page, groupName: string, config: Config) {
  const search = page.locator(config.selectors.searchBox).first();
  await search.click({ timeout: 10000 });
  await search.fill(groupName);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  const exact = page.getByText(groupName, { exact: false }).first();
  if (await exact.count().catch(() => 0)) {
    await exact.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
}

async function readMessages(page: Page, groupName: string, config: Config): Promise<Msg[]> {
  const rows = await page.evaluate(
    ({ selectors, maxMessagesPerGroup, groupName }) => {
      const items = Array.from(document.querySelectorAll(selectors.messageItems)).slice(
        -maxMessagesPerGroup
      );

      return items.map((el: any) => {
        const textEl = selectors.messageText
          ? el.querySelector(selectors.messageText)
          : el;

        const senderEl = selectors.messageSender
          ? el.querySelector(selectors.messageSender)
          : null;

        const text = String(textEl?.innerText || el?.innerText || "").trim();
        const senderName = String(senderEl?.innerText || "").trim() || "Không rõ";

        const imgs = Array.from(el.querySelectorAll(selectors.imageNodes || "img"))
          .map((img: any) => String(img?.src || ""))
          .filter((src) => {
            if (!src) return false;
            if (src.startsWith("data:")) return false;
            if (src.includes("emoji")) return false;
            return true;
          });

        return { text, senderName, imageSrcs: imgs, groupName };
      });
    },
    {
      selectors: config.selectors,
      maxMessagesPerGroup: config.maxMessagesPerGroup,
      groupName,
    }
  );

  return rows
    .filter((m: any) => m.text || m.imageSrcs?.length)
    .map((m: any) => {
      const sourceHash = hash(
        [groupName, m.senderName, m.text, ...(m.imageSrcs || [])].join("|")
      );

      return {
        text: m.text || "",
        senderName: m.senderName || "Không rõ",
        imageSrcs: m.imageSrcs || [],
        sourceHash,
      };
    });
}

async function imageToBase64(page: Page, src: string) {
  return page.evaluate(async (url) => {
    const res = await fetch(url);
    const blob = await res.blob();

    const buf = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

    return {
      mimeType: blob.type || "image/webp",
      base64: btoa(binary),
    };
  }, src);
}

async function sendBatch(params: {
  page: Page;
  config: Config;
  groupName: string;
  msg: Msg;
}) {
  const { page, config, groupName, msg } = params;

  const images = [];
  for (const src of msg.imageSrcs.slice(0, config.maxImagesPerBatch)) {
    try {
      const data = await imageToBase64(page, src);
      images.push({
        name: `${crypto.randomUUID()}.webp`,
        mimeType: data.mimeType,
        base64: data.base64,
      });
    } catch (e) {
      console.warn("Không lấy được ảnh:", src);
    }
  }

  const res = await fetch(`${config.webBaseUrl}/api/internal/zalo-reader/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": config.internalSecret,
    },
    body: JSON.stringify({
      groupName,
      senderName: msg.senderName,
      sourceHash: msg.sourceHash,
      rawText: msg.text,
      sentAt: new Date().toISOString(),
      images,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Import failed HTTP ${res.status}`);
  }

  return json;
}

async function main() {
  const config = readConfig();
  const state = readState();

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://chat.zalo.me", { waitUntil: "domcontentloaded" });

  console.log("Nếu chưa login Zalo Web, hãy quét QR trong cửa sổ Chrome.");
  console.log("Sau khi login xong tool sẽ tự quét nhóm.");

  while (true) {
    for (const groupName of config.groups) {
      try {
        console.log(`\nĐang quét nhóm: ${groupName}`);

        await openGroup(page, groupName, config);

        const messages = await readMessages(page, groupName, config);

        for (const msg of messages) {
          if (state[msg.sourceHash]) continue;
          if (!isRoomText(msg.text, config.roomTextKeywords)) continue;

          console.log(`Import tin: ${msg.text.slice(0, 80)}...`);

          const result = await sendBatch({
            page,
            config,
            groupName,
            msg,
          });

          state[msg.sourceHash] = true;
          writeState(state);

          console.log("OK:", result);
        }
      } catch (e: any) {
        console.error(`Lỗi nhóm ${groupName}:`, e?.message || e);
      }
    }

    console.log(`\nNghỉ ${Math.round(config.scanIntervalMs / 1000)}s...`);
    await page.waitForTimeout(config.scanIntervalMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});