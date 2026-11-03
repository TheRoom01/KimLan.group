import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type BrowserContext } from "playwright";

export const readerProfile = (root: string) => path.join(root, ".zalo-reader/profile");

/** Only connect to the local browser whose command line names this exact profile. */
export async function connectReaderBrowser(profile: string): Promise<Browser | null> {
  let endpoint: string;
  try {
    const [port, socket] = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").trim().split(/\r?\n/);
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !/^\/devtools\/browser\/[a-z0-9-]+$/i.test(socket)) return null;
    endpoint = `ws://127.0.0.1:${port}${socket}`;
  } catch { return null; }
  let browser: Browser;
  try { browser = await chromium.connectOverCDP(endpoint, { timeout: 2000 }); }
  catch { return null; }
  try {
    const session = await browser.newBrowserCDPSession();
    try {
      const { arguments: args } = await session.send("Browser.getBrowserCommandLine");
      const directory = args.find(arg => arg.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
      if (!directory || path.resolve(directory).toLowerCase() !== path.resolve(profile).toLowerCase()) throw new Error("PROFILE_MISMATCH");
    } finally { await session.detach(); }
    return browser;
  } catch (cause) {
    // Closing a CDP client disconnects it, leaving the browser host alive.
    await browser.close();
    throw new Error("READER_BROWSER_PROFILE_MISMATCH", { cause });
  }
}

export async function ensureReaderBrowser(root: string, start = startBrowserTask): Promise<void> {
  const profile = readerProfile(root);
  const existing = await connectReaderBrowser(profile);
  if (existing) { await existing.close(); return; }
  await start(root);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const browser = await connectReaderBrowser(profile);
    if (browser) { await browser.close(); return; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("READER_BROWSER_NOT_READY: Cần cập nhật tác vụ KimLan-ZaloReader-Browser và đăng nhập Windows trên máy Reader. Nếu phiên Zalo cũ vẫn mở, đóng cửa sổ đó rồi thử lại.");
}

async function startBrowserTask(_root: string) {
  if (process.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Start-ScheduledTask -TaskName 'KimLan-ZaloReader-Browser' -ErrorAction Stop"], { windowsHide: true, encoding: "utf8", timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error("READER_BROWSER_TASK_UNAVAILABLE");
}

export function isZaloPage(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "chat.zalo.me"; }
  catch { return false; }
}

export async function getReaderZaloPage(context: BrowserContext, navigate = true) {
  const existing = context.pages().find(page => isZaloPage(page.url()));
  if (existing) return existing;
  const page = context.pages().find(page => page.url() === "about:blank") || await context.newPage();
  if (navigate) await page.goto("https://chat.zalo.me", { waitUntil: "domcontentloaded" });
  return page;
}

export async function openReaderZalo(root: string) {
  await ensureReaderBrowser(root);
  const browser = await connectReaderBrowser(readerProfile(root));
  if (!browser) throw new Error("READER_BROWSER_DISCONNECTED");
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("READER_BROWSER_CONTEXT_MISSING");
    const page = await getReaderZaloPage(context);
    const session = await context.newCDPSession(page);
    try {
      const { windowId } = await session.send("Browser.getWindowForTarget");
      await session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      await page.bringToFront();
    } finally { await session.detach(); }
  } finally { await browser.close(); }
}

/** A separate, unlimited Windows task owns the window, independently of scans/control polling. */
export async function hostReaderBrowser(root: string) {
  const profile = readerProfile(root);
  const existing = await connectReaderBrowser(profile);
  if (existing) { await existing.close(); return; }
  fs.mkdirSync(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    headless: false, viewport: null,
    args: ["--enable-automation", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--window-size=1400,900"],
  });
  // The reader and Open Zalo decide when to navigate; never reload an active tab here.
  await new Promise<void>(resolve => {
    context.once("close", () => resolve());
    if (!context.browser()?.isConnected()) resolve();
  });
}

if (process.argv[1] && /(?:^|[\\/])browser-session\.ts$/.test(process.argv[1])) {
  hostReaderBrowser(path.resolve(path.dirname(process.argv[1]), "../..")).catch(() => {
    console.error("READER_BROWSER_FAILED: Kiểm tra profile Zalo và phiên Windows tương tác.");
    process.exitCode = 1;
  });
}
