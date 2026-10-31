import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { OFFICIAL_ZALO_GROUPS, READER_INTERVAL_MS, redactReaderLog } from "../../lib/zalo-reader/official";
import { OfficialSession, acquireReaderLock, atomicJson, setOfficialSession, safeConsole } from "./official-runtime";
import { buildSemanticTimelineRooms } from "./parsers";

export function readerCycleDue(scheduled: boolean, previous: { runId?: string | null; nextEligibleAt?: string } | null, now = Date.now()) {
  const next = Date.parse(previous?.nextEligibleAt || "");
  return !scheduled || !previous?.runId || !Number.isFinite(next) || now >= next;
}
export function validateOfficialConfig(config: any) {
  if (config.intervalMinutes !== 60 || config.profileDirectory !== ".zalo-reader/profile" || typeof config.enabled !== "boolean") throw new Error("OFFICIAL_CONFIG_INVALID");
  if (config.maxLookbackHours !== 24 || config.runGroupsSequentially !== true || config.intervalFromCompletion !== true) throw new Error("OFFICIAL_CYCLE_CONFIG_INVALID");
  if (!Array.isArray(config.groups) || config.groups.length !== 2 || new Set(config.groups.map((group: any) => group.key)).size !== 2) throw new Error("OFFICIAL_GROUP_ALLOWLIST_INVALID");
  for (const allowed of OFFICIAL_ZALO_GROUPS) {
    const group = config.groups.find((group: any) => group.key === allowed.key && group.name === allowed.name);
    if (!group || (allowed.groupId && group.groupId !== allowed.groupId) || (group.groupId && !/^g\d{10,30}$/.test(group.groupId))) throw new Error("OFFICIAL_GROUP_ALLOWLIST_INVALID");
  }
  for (const [field, minimum, maximum] of [["initialLookbackHours",1,24],["overlapMinutes",1,60],["maxMessagesPerGroup",1,100],["maxRoomsPerGroup",1,100],["maxScrollSteps",20,1000]] as const) {
    if (!Number.isInteger(config[field]) || config[field] < minimum || config[field] > maximum) throw new Error(`OFFICIAL_CONFIG_INVALID_${field}`);
  }
  return config;
}
export function validateProductionMode(config:any,args:string[],env:Partial<NodeJS.ProcessEnv>=process.env) {
  validateOfficialConfig(config);
  if(config.mode!=="production" || args.some(arg=>["--trial","--fixture"].includes(arg))) throw new Error("PRODUCTION_MODE_CONFLICT: Không kết hợp production với test/fixture.");
  for(const flag of ["allowReimportForTesting","testImportToPending","officialTrial","previewOnly","stagingOnlyImport"]) {
    if(config[flag]!==false) throw new Error(`PRODUCTION_MODE_CONFLICT: ${flag} phải là false trong production.config.json.`);
  }
  for(const key of ["ZALO_READER_CONFIG_PATH","ZALO_READER_VIDEO_PROBE","ZALO_READER_EMBEDDED"]) {
    if(env[key]) throw new Error(`PRODUCTION_ENV_CONFLICT: Hãy bỏ ${key} trước khi chạy production.`);
  }
  if(env.ZALO_READER_PROFILE_DIR && path.resolve(env.ZALO_READER_PROFILE_DIR)!==path.resolve(config.profileDirectory)) throw new Error("PRODUCTION_PROFILE_CONFLICT");
  const api=new URL(env.ZALO_READER_PRODUCTION_API_URL || config.webBaseUrl);
  if((api.protocol!=="https:" && !(api.protocol==="http:" && ["localhost","127.0.0.1"].includes(api.hostname))) || api.origin!==new URL(config.webBaseUrl).origin || api.pathname!=="/" || api.search || api.hash || api.username || api.password) throw new Error("PRODUCTION_API_CONFLICT: API phải trùng origin đã cấu hình trong production.config.json; HTTP chỉ dành cho máy local.");
  return api;
}
export function effectiveReaderConfig(base:any,config:any,api:URL,trial:boolean) {
  return { ...base, officialReader: true, runOnce: true, nonInteractive: true,
    officialTrial: trial, webBaseUrl: api.origin, profileDirectory: ".zalo-reader/profile",
    previewOnly: false, stagingOnlyImport: false, testImportToPending: false, testNewSourcesOnly: false, allowReimportForTesting: false,
    networkDebug: false, networkDebugOnly: false, indexedDbDebug: false, indexedDbDebugOnly: false,
    mode:trial?"trial":"production", scanIntervalMs: READER_INTERVAL_MS, indexedDbStopOnKnownRoom: false,
    indexedDbScrollStepsPerBatch: 1, indexedDbScrollMaxBatches: config.maxScrollSteps,
    indexedDbImportLimit: config.maxRoomsPerGroup, indexedDbImportSourceHashes: undefined,
    strictMessageLookback: true, indexedDbGroupMessageLimit: 20000, indexedDbGroupScanLimit: 100000,
    indexedDbGroupExport: true, indexedDbRoomPreview: true, indexedDbImportEnabled: true,
    groups: OFFICIAL_ZALO_GROUPS.map(allowed => config.groups.find((group:any)=>group.key===allowed.key)).map((group:any)=>({ ...group, parser:"semantic-timeline",parserOptions:{mediaBias:"after",buildingBoundary:"address-or-separator",splitBySender:false,
      allowMediaOnly:true,allowTextOnly:true,maxMediaGapMs:1800000,boundaryGapMs:2700000} })) };
}
async function confirmProduction(args:string[]) {
  if(args.includes("--confirm-production")) return;
  if(!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("PRODUCTION_CONFIRMATION_REQUIRED: Xác nhận lượt chạy trước, rồi dùng --confirm-production.");
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try { if((await prompt.question("Gõ PRODUCTION để đọc hai nhóm trong 24 giờ, tạo Pending thật và duyệt thủ công: ")).trim()!=="PRODUCTION") throw new Error("PRODUCTION_NOT_CONFIRMED"); }
  finally {prompt.close();}
}
function localEnvironment(root: string) {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
export async function runOfflineFixture(file: string, root: string) {
  const fixture = JSON.parse(fs.readFileSync(file, "utf8"));
  const directory = path.join(root, ".zalo-reader", "official-fixtures", randomUUID());
  const now = Number(fixture.now);
  const session = new OfficialSession({ stateDirectory: directory, trial: false, initialLookbackHours: 24, overlapMinutes: 15,
    maxMessages: fixture.maxMessages || 10, maxRooms: fixture.maxRooms || 20, maxScrollSteps: 200, now: () => now });
  for (const allowed of OFFICIAL_ZALO_GROUPS) {
    const input = fixture.groups.find((group: any) => group.key === allowed.key);
    if (!input) throw new Error("FIXTURE_GROUP_MISSING");
    const config: any = {};
    await session.beginGroup(config, allowed.key, allowed.name);
    session.verify(input.groupId, true, 1, "dom_message_id"); // fixture IDs stay in the isolated fixture directory
    const rooms = buildSemanticTimelineRooms({ groupName: allowed.name, groupId: input.groupId, messages: input.messages,
      parserOptions: { mediaBias: "after", buildingBoundary: "address-or-separator", splitBySender: false, allowMediaOnly: false,
        allowTextOnly: true, maxMediaGapMs: 1800000, boundaryGapMs: 2700000 } });
    session.observe(input.messages.map((message: any) => ({ id: String(message.msgId), timestamp: message.sendDttm,
      verified: true, nonRoom: message.fixtureNonRoom === true })), true);
    const selected = session.select(rooms as any[]);
    for (const room of selected) session.accept(room, { ok: true, pendingVersionId: `fixture-${room.markerMessageId}`,
      importType: input.importType || "CREATE", duplicate: false });
    await session.finishGroup();
  }
  console.log(JSON.stringify({ offline: true, networkCalls: 0, browserLaunched: false, pendingWrites: 0, reportDirectory: directory, groups: session.summaries.map(group => ({ key: group.groupKey, counters: group.counters, status: group.status })) }));
  return session;
}
export async function main(args = process.argv.slice(2)) {
  const root = process.cwd();
  const production=args.includes("--production");
  if(production && (args.some(arg=>!["--production","--confirm-production","--scheduled","--report-enabled","--report-disabled"].includes(arg)) || (args.includes("--report-enabled") && args.includes("--report-disabled")))) throw new Error("PRODUCTION_ARGUMENT_CONFLICT");
  const fixtureIndex = args.indexOf("--fixture");
  if (fixtureIndex >= 0) return runOfflineFixture(path.resolve(args[fixtureIndex + 1]), root);
  const configPath = path.resolve(root, production?"tools/zalo-reader/production.config.json":"tools/zalo-reader/official.config.json");
  const config = validateOfficialConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  const trial = args.includes("--trial");
  const control = args.includes("--report-enabled") ? "enabled" : args.includes("--report-disabled") ? "disabled" : null;
  if (!production && !trial && !control && !config.enabled) throw new Error("OFFICIAL_NOT_ENABLED: Cần xác nhận cuối cùng trước khi bật lịch chính thức.");
  const directory = path.resolve(root, config.stateDirectory);
  if (!directory.startsWith(path.resolve(root) + path.sep)) throw new Error("STATE_DIRECTORY_OUTSIDE_WORKSPACE");
  localEnvironment(root);
  const productionApi=production?validateProductionMode(config,args):null;
  const secret = process.env.ZALO_READER_INTERNAL_SECRET || "";
  if (!secret) throw new Error("READER_SECRET_NOT_CONFIGURED");
  const base = JSON.parse(fs.readFileSync(path.join(root, "tools/zalo-reader/config.json"), "utf8"));
  const apiBase = trial ? process.env.ZALO_READER_STAGING_API_URL || "http://127.0.0.1:3000" : process.env.ZALO_READER_WEB_BASE_URL || base.webBaseUrl;
  const api = productionApi || new URL(apiBase);
  if (api.username || api.password || api.search || api.hash || (api.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(api.hostname))) throw new Error("OFFICIAL_API_URL_INVALID");
  const report = async (body: Record<string, any>) => {
    const response = await fetch(new URL("/api/internal/zalo-reader/status", api), { method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("STATUS_API_UNAVAILABLE");
  };
  if (control) {
    await report({ control, nextExpectedAt: process.env.ZALO_READER_NEXT_RUN_AT || null });
    return;
  }
  if(production) {
    console.log(JSON.stringify({mode:"PRODUCTION",api:api.origin,config:configPath,profile:config.profileDirectory,groups:config.groups.map((group:any)=>group.name),lookbackHours:24,maxSourceMessagesPerGroup:config.maxMessagesPerGroup,maxPendingPerGroup:config.maxRoomsPerGroup,autoPublish:false,schedulerChanged:false,legacyTestConfigIgnored:true,legacyApiOverrideIgnored:!!process.env.ZALO_READER_WEB_BASE_URL}));
    await confirmProduction(args);
  }
  let release: (() => void) | undefined;
  try { release = acquireReaderLock(directory); }
  catch (error) {
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, "skipped-runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), code: "READER_ALREADY_RUNNING" }) + "\n");
    throw error;
  }
  const restoreConsole = safeConsole();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let session: OfficialSession | undefined;
  let cycleAttempted = false;
  try {
    const cycleFile = path.join(directory,"cycle-state.json");
    const previousCycle = fs.existsSync(cycleFile) ? JSON.parse(fs.readFileSync(cycleFile,"utf8")) : null;
    // Older preflight failures wrote a cycle with runId:null without reading Zalo.
    // Such records must not delay a real run; keep valid completed cycles intact.
    if(!trial && !readerCycleDue(args.includes("--scheduled"), previousCycle)) {
      console.log(`READER_CYCLE_NOT_DUE: Chờ đủ 60 phút sau khi lượt trước kết thúc. Có thể chạy lại từ ${new Date(previousCycle.nextEligibleAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`);
      return;
    }
    // A normal exclusive-file check; do not remove Chrome's lock or stop Chrome.
    if (process.platform === "win32") {
      const profileLock = path.join(root, ".zalo-reader/profile/lockfile").replace(/'/g, "''");
      const check = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$p='${profileLock}';if(Test-Path -LiteralPath $p){try{$h=[IO.File]::Open($p,'Open','ReadWrite','None');$h.Dispose()}catch{exit 12}}`], { windowsHide: true, stdio: "ignore" });
      if (check.status !== 0) throw new Error("PROFILE_IN_USE");
    }
    let health: Response;
    try {
      health = await fetch(new URL("/api/internal/zalo-reader/status", api), { headers: { "x-internal-secret": secret }, signal: AbortSignal.timeout(10000) });
    } catch {
      throw new Error(`READER_API_UNREACHABLE: Không kết nối được API tại ${api.origin}. Hãy chạy npm run dev trong Terminal khác, chờ server sẵn sàng đúng địa chỉ này rồi chạy lại Reader. Chưa bắt đầu đọc Zalo; không áp dụng thời gian chờ 60 phút.`);
    }
    const readiness = await health.json();
    if (!health.ok || readiness.ready !== true) throw new Error("READER_DATABASE_NOT_READY");
    session = new OfficialSession({ stateDirectory: directory, trial, initialLookbackHours: config.initialLookbackHours,
      overlapMinutes: config.overlapMinutes, maxMessages: trial ? Math.min(5,config.maxMessagesPerGroup) : config.maxMessagesPerGroup,
      maxRooms: trial ? Math.min(5,config.maxRoomsPerGroup) : config.maxRoomsPerGroup,
      maxScrollSteps: config.maxScrollSteps, report,
      reconcile: async (groupKey, sources) => {
        const replay: string[] = [];
        for (let offset = 0; offset < sources.length; offset += 100) {
          const response = await fetch(new URL("/api/internal/zalo-reader/receipts", api), { method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": secret }, body: JSON.stringify({ groupKey, sources: sources.slice(offset, offset + 100) }), signal: AbortSignal.timeout(15000) });
          const body = await response.json();
          if (!response.ok || !Array.isArray(body.replay)) throw new Error("READER_RECEIPTS_UNAVAILABLE");
          replay.push(...body.replay);
        }
        return replay;
      } });
    setOfficialSession(session);
    const effective = effectiveReaderConfig(base,config,api,trial);
    const effectivePath = path.join(directory, "effective-config.json");
    delete effective.indexedDbImportSourceHashes;
    atomicJson(effectivePath, { ...effective, internalSecret: "" });
    process.env.ZALO_READER_CONFIG_PATH = effectivePath;
    process.env.ZALO_READER_PROFILE_DIR = path.join(root, ".zalo-reader/profile");
    process.env.ZALO_READER_WEB_BASE_URL = api.origin;
    process.env.ZALO_READER_EMBEDDED = "1";
    delete process.env.ZALO_READER_VIDEO_PROBE;
    heartbeat = setInterval(() => { void session?.heartbeat().catch(() => console.warn("READER_HEARTBEAT_FAILED")); }, 30000);
    heartbeat.unref();
    const reader = await import("./zalo-reader.before-semantic-parser");
    cycleAttempted = true;
    await reader.runReader();
  } catch (error: any) {
    const code = /LOGIN|login|đăng nhập/.test(String(error?.message)) ? "LOGIN_REQUIRED" : /PROFILE/.test(String(error?.message)) ? "PROFILE_IN_USE" : "READER_RUN_FAILED";
    await session?.finishGroup(code);
    for (const group of OFFICIAL_ZALO_GROUPS) if (!session?.summaries.some(summary => summary.groupKey === group.key)) {
      try { await report({ runId: session?.runId || randomUUID(), groupKey: group.key, groupName: group.name, groupId: group.groupId,
        mode: trial ? "trial" : "official", status: code === "LOGIN_REQUIRED" ? "login_required" : "error",
        startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), counters: { failed: 1 }, errorCode: code }); }
      catch { /* local failure log remains available if the API itself is down */ }
    }
    fs.appendFileSync(path.join(directory, "failures.jsonl"), JSON.stringify({ at: new Date().toISOString(), code }) + "\n");
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (cycleAttempted && !trial) atomicJson(path.join(directory, "last-completed-run.json"), { finishedAt: new Date().toISOString(), runId: session?.runId || null });
    if(cycleAttempted && !trial && args.includes("--scheduled")) {
      const finishedAt = new Date().toISOString();
      const nextEligibleAt = new Date(Date.parse(finishedAt)+READER_INTERVAL_MS).toISOString();
      atomicJson(path.join(directory,"cycle-state.json"),{finishedAt,nextEligibleAt,runId:session?.runId || null});
      try { await report({control:"cycle-finished",nextExpectedAt:nextEligibleAt}); } catch { console.warn("READER_NEXT_RUN_REPORT_UNAVAILABLE: Đã lưu giờ chạy tiếp theo ở máy này nhưng chưa gửi được báo cáo lên API."); }
    }
    setOfficialSession(null); restoreConsole(); release?.();
  }
}
if (path.resolve(process.argv[1] || "") === path.resolve(__filename)) {
  main().catch(error => { console.error(redactReaderLog(error instanceof Error ? error.message : "READER_ERROR")); process.exitCode = 1; });
}
