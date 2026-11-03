import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openReaderZalo } from "./browser-session";

type Control = { request_id: string | null; applied_request_id: string | null; desired_enabled: boolean | null; open_request_id?: string | null; open_applied_request_id?: string | null };
export async function syncReaderControl(deps: {
  read: () => Promise<Control>; actual: () => boolean;
  apply: (enabled: boolean) => void;
  runNow: (requestId: string) => Promise<void>;
  openZalo?: () => Promise<void>;
  report: (body: { actualEnabled: boolean; requestId?: string; error?: string; openRequestId?: string; openError?: string }) => Promise<void>;
}) {
  let command = await deps.read();
  let actual = deps.actual();
  if (command.open_request_id && command.open_request_id !== command.open_applied_request_id) {
    try {
      if (!deps.openZalo) throw new Error("OPEN_NOT_SUPPORTED");
      await deps.openZalo();
      await deps.report({ actualEnabled: actual, openRequestId: command.open_request_id });
    } catch {
      await deps.report({ actualEnabled: actual, openRequestId: command.open_request_id, openError: "ZALO_OPEN_FAILED" });
    }
    // Opening/login can take time; apply the latest Start/Stop, not a stale command.
    command = await deps.read();
    actual = deps.actual();
  }
  if (!command.request_id || command.request_id === command.applied_request_id || typeof command.desired_enabled !== "boolean") {
    await deps.report({ actualEnabled: actual });
    return;
  }
  try {
    // Only fixed Start/Stop actions, never executable code supplied by the web.
    // Starting an already-enabled schedule only needs the immediate run;
    // re-enabling it invokes production preflight and needlessly delays the ACK.
    if (actual !== command.desired_enabled) deps.apply(command.desired_enabled);
    actual = deps.actual();
    if (actual !== command.desired_enabled) throw new Error("SCHEDULER_CONTROL_FAILED");
    if (command.desired_enabled) await deps.runNow(command.request_id);
    await deps.report({ actualEnabled: actual, requestId: command.request_id });
  } catch {
    await deps.report({ actualEnabled: deps.actual(), requestId: command.request_id, error: "SCHEDULER_CONTROL_FAILED" });
  }
}

/** A durable receipt prevents replaying an immediate run if the ACK is lost. */
export async function launchReaderOnce(directory: string, requestId: string, launch: () => Promise<void>) {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new Error("INVALID_CONTROL_REQUEST");
  fs.mkdirSync(directory, { recursive: true });
  const receipt = path.join(directory, `${requestId}.json`);
  try {
    const descriptor = fs.openSync(receipt, "wx");
    fs.writeFileSync(descriptor, JSON.stringify({ requestId, acceptedAt: new Date().toISOString() }));
    fs.closeSync(descriptor);
  } catch (error: any) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  try { await launch(); }
  catch (error) { fs.unlinkSync(receipt); throw error; }
}

async function main() {
  if (process.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
  const root = path.resolve(path.dirname(process.argv[1]), "../..");
  const envFile = path.join(root, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const config = JSON.parse(fs.readFileSync(path.join(root, "tools/zalo-reader/production.config.json"), "utf8"));
  const base = new URL(config.webBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("INVALID_API_URL");
  const secret = process.env.ZALO_READER_INTERNAL_SECRET;
  if (!secret) throw new Error("READER_SECRET_NOT_CONFIGURED");
  const endpoint = new URL("/api/internal/zalo-reader/control", base);
  const headers = { "x-internal-secret": secret, "Content-Type": "application/json" };
  const powershell = (args: string[]) => {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", ...args], {
      cwd: root, windowsHide: true, encoding: "utf8", timeout: 120000,
    });
    if (result.error || result.status !== 0) throw new Error("SCHEDULER_CONTROL_FAILED");
    return result.stdout.trim();
  };
  await syncReaderControl({
    read: async () => {
      const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("CONTROL_API_UNAVAILABLE");
      return (await response.json()).control;
    },
    actual: () => powershell(["-Command", "if((Get-ScheduledTask -TaskName 'KimLan-ZaloReader-60m' -ErrorAction Stop).Settings.Enabled){'true'}else{'false'}"]) === "true",
    apply: enabled => { powershell(["-File", path.join(root, "tools/zalo-reader/scheduler.ps1"), "-Action", enabled ? "Enable" : "Disable", ...(enabled ? ["-Confirmed"] : [])]); },
    runNow: requestId => launchReaderOnce(path.join(root, ".zalo-reader/official/ui-start-requests"), requestId, async () => {
      // An independent on-demand task keeps the scan outside the short-lived
      // controller's job/time limit. The runner's lock still prevents overlap.
      powershell(["-Command", "Start-ScheduledTask -TaskName 'KimLan-ZaloReader-Now' -ErrorAction Stop"]);
    }),
    openZalo: () => openReaderZalo(root),
    report: async body => {
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("CONTROL_REPORT_FAILED");
    },
  });
}
if (process.argv[1] && /(?:^|[\\/])control-agent\.ts$/.test(process.argv[1])) {
  main().catch(() => { console.error("READER_CONTROL_UNAVAILABLE: Kiểm tra kết nối API và lịch Windows."); process.exitCode = 1; });
}
