import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { OFFICIAL_ZALO_GROUPS, initializeCheckpoint, checkpointWindow, verifiedGroupIdentity, selectIncrementalSources,
  verifiedProcessingReceipt, commitSource, advanceWatermark, redactReaderLog, READER_INTERVAL_MS, type GroupCheckpoint } from "../../lib/zalo-reader/official";
import { normalizedRoomIdentity } from "../../lib/zalo-import/room-comparison";

export function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}
export function acquireReaderLock(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "reader.lock");
  const owner = { pid: process.pid, startedAt: new Date().toISOString(), nonce: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx"); fs.writeFileSync(fd, JSON.stringify(owner)); fs.closeSync(fd);
      return () => { try { if (JSON.parse(fs.readFileSync(file, "utf8")).nonce === owner.nonce) fs.unlinkSync(file); } catch {} };
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const previous = JSON.parse(fs.readFileSync(file, "utf8"));
      try { process.kill(previous.pid, 0); throw new Error("READER_ALREADY_RUNNING"); }
      catch (probe: any) {
        if (probe.code !== "ESRCH") throw new Error("READER_ALREADY_RUNNING");
        // Only our dead-process lock file, never Chrome locks/checkpoints.
        fs.unlinkSync(file);
      }
    }
  }
  throw new Error("READER_LOCK_UNAVAILABLE");
}
export type OfficialOptions = { stateDirectory: string; runId?: string; trial: boolean; overlapMinutes: number;
  initialLookbackHours: number; maxMessages: number; maxRooms: number; maxScrollSteps: number;
  report?: (event: Record<string, any>) => Promise<void>; now?: () => number };
type ActiveGroup = { key: string; name: string; checkpoint: GroupCheckpoint; file: string; startedAt: string;
  window: { fromMs: number; toMs: number };
  observed: Array<{ id: string; timestamp: number }>; complete: boolean; sourceSizes: Record<string, number>;
  acknowledgements: Record<string, { count: number; ids: Set<string>; timestamp: number; kind: string }>;
  counters: Record<string, number>; errors: Array<{ code: string; sourceMessageId?: string }>; groupId: string | null };

export class OfficialSession {
  readonly runId: string;
  readonly now: () => number;
  active: ActiveGroup | null = null;
  readonly summaries: any[] = [];
  totalPending = 0;
  constructor(readonly options: OfficialOptions) { this.runId = options.runId || randomUUID(); this.now = options.now || Date.now; }
  private checkpointFile(key: string) {
    return path.join(this.options.stateDirectory, this.options.trial ? `trials/${this.runId}/checkpoints` : "checkpoints", `${key}.json`);
  }
  private save() { if (this.active) atomicJson(this.active.file, this.active.checkpoint); }
  private async event(status: string, errorCode?: string) {
    if (!this.active) return;
    const group = this.active;
    const event = { runId: this.runId, groupKey: group.key, groupName: group.name, groupId: group.groupId,
      mode: this.options.trial ? "trial" : "official", schedulerEnabled: !this.options.trial,
      startedAt: group.startedAt, heartbeatAt: new Date(this.now()).toISOString(), status,
      windowFrom: new Date(group.window.fromMs).toISOString(), windowTo: new Date(group.window.toMs).toISOString(),
      counters: group.counters, errorCode: errorCode || null,
      nextExpectedAt: this.options.trial ? null : new Date(this.now() + READER_INTERVAL_MS).toISOString() };
    fs.mkdirSync(path.join(this.options.stateDirectory, "logs"), { recursive: true });
    fs.appendFileSync(path.join(this.options.stateDirectory, "logs", `${this.runId}.jsonl`), JSON.stringify(event) + "\n");
    try { await this.options.report?.(event); } catch { console.warn("READER_STATUS_REPORT_UNAVAILABLE"); }
  }
  async beginGroup(config: any, key: string, name: string) {
    const allowed = OFFICIAL_ZALO_GROUPS.find(group => group.key === key && group.name === name);
    if (!allowed) throw new Error("GROUP_NOT_ALLOWED");
    const file = this.checkpointFile(key);
    const checkpoint: GroupCheckpoint = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : initializeCheckpoint(key, this.now(), this.options.initialLookbackHours);
    if (checkpoint.key !== key || checkpoint.version !== 1) throw new Error("CHECKPOINT_INVALID");
    const verifiedFile = path.join(this.options.stateDirectory, "verified-groups.json");
    const registry = fs.existsSync(verifiedFile) ? JSON.parse(fs.readFileSync(verifiedFile, "utf8")) : {};
    if (!checkpoint.groupId && registry[key]?.name === name && /^g\d{10,30}$/.test(registry[key]?.groupId || "")) checkpoint.groupId = registry[key].groupId;
    const configuredId = config.groups?.find((entry: any) => entry.key === key)?.groupId;
    if (configuredId && checkpoint.groupId && configuredId !== checkpoint.groupId) throw new Error("GROUP_ID_CHANGED");
    const missed = checkpoint.lastAttemptAt ? Math.max(0, Math.floor((this.now() - Date.parse(checkpoint.lastAttemptAt)) / READER_INTERVAL_MS) - 1) : 0;
    const window = checkpointWindow(checkpoint, this.now(), this.options.overlapMinutes);
    this.active = { key, name, checkpoint, file, startedAt: new Date(this.now()).toISOString(), observed: [], complete: false,
      window,
      sourceSizes: {}, acknowledgements: {}, counters: { missed_intervals: missed, new_messages: 0, new_rooms: 0, updated_rooms: 0,
        needs_review: 0, pending_created: 0, existing_sources: 0, unchanged: 0, skipped: 0, failed: 0, media_errors: 0 }, errors: [], groupId: checkpoint.groupId };
    checkpoint.lastAttemptAt = this.active.startedAt;
    this.save(); // initializes the fixed first-run boundary, NOT a processing acknowledgement
    config.officialFromMs = window.fromMs; config.officialToMs = window.toMs;
    config.officialStopIds = Object.entries(checkpoint.receipts).filter(([,receipt]) => receipt.anchor && receipt.timestamp <= window.fromMs)
      .sort((a,b) => b[1].timestamp - a[1].timestamp).slice(0, 4).map(([id]) => id);
    config.indexedDbHistoryLookbackMs = this.now() - window.fromMs;
    config.messageLookbackHours = 24;
    config.indexedDbScrollMaxBatches = Math.min(1000, this.options.maxScrollSteps + (checkpoint.scanExpansion || 0));
    await this.event("running");
  }
  verify(id: string, trusted: boolean, exactCount: number, identificationSource: string) {
    const group = this.active!;
    verifiedGroupIdentity(group.key, id, true, exactCount, trusted, group.checkpoint.groupId);
    if (!group.checkpoint.groupId && !/dom|message|ui/i.test(identificationSource)) throw new Error("GROUP_ID_UNVERIFIED");
    group.groupId = id; group.checkpoint.groupId = id; this.save();
    const verifiedFile = path.join(this.options.stateDirectory, "verified-groups.json");
    const verified = fs.existsSync(verifiedFile) ? JSON.parse(fs.readFileSync(verifiedFile, "utf8")) : {};
    verified[group.key] = { name: group.name, groupId: id, verifiedAt: new Date(this.now()).toISOString(), method: identificationSource };
    atomicJson(verifiedFile, verified);
  }
  observe(messages: Array<{ id: string; timestamp: number; verified: boolean; nonRoom: boolean }>, complete: boolean) {
    const group = this.active!;
    const window = group.window;
    const relevant = messages.filter(message => Number.isSafeInteger(message.timestamp) && message.timestamp >= window.fromMs && message.timestamp <= window.toMs);
    group.observed = relevant;
    group.complete = complete;
    group.counters.new_messages = relevant.filter(message => !group.checkpoint.receipts[message.id]).length;
    for (const message of relevant) if (message.verified && message.nonRoom) commitSource(group.checkpoint, [message.id], message.timestamp, "non_room");
    this.save();
  }
  verifiedTextContext<T extends Record<string, any>>(messages: T[], verified: (message: T) => boolean): T[] {
    const group = this.active!;
    const file = group.file.replace(/\.json$/, ".verified-text.json");
    const cached: Record<string, T> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    for (const message of messages) {
      const id = String(message.msgId || "");
      if (id && message.kind === "text" && verified(message) && typeof message.text === "string" && message.text.trim()) cached[id] = message;
    }
    atomicJson(file, cached);
    const merged = new Map(messages.map(message => [String(message.msgId), message]));
    for (const [id, message] of Object.entries(cached)) {
      const timestamp = Number(message.trustedTimestampMs || message.sendDttm || message.serverTime || 0);
      if (timestamp < group.window.toMs - 24 * READER_INTERVAL_MS || timestamp > group.window.toMs) continue;
      const current = merged.get(id);
      if (!current || !verified(current)) merged.set(id, { ...message, imageUrls: [], videoUrls: [], videoThumbUrls: [] });
    }
    return [...merged.values()];
  }
  select<T extends { markerMessageId: string; markerTimestamp: number; imageMessageIds?: string[]; videoMessageIds?: string[]; sourceHash: string; warnings?: string[] }>(rooms: T[]) {
    const group = this.active!;
    const remaining = this.options.trial ? Math.max(0, 10 - this.totalPending) : this.options.maxRooms;
    const selection = selectIncrementalSources(rooms, group.checkpoint, group.window.toMs, this.options.maxMessages, Math.min(this.options.maxRooms, remaining), this.options.overlapMinutes);
    group.sourceSizes = selection.sourceSizes;
    group.counters.skipped = Object.values(selection.excluded).reduce((sum, count) => sum + count, 0);
    for (const [reason,count] of Object.entries(selection.excluded)) group.counters[`skipped_${reason}`] = count;
    return selection.rooms;
  }
  requestFields(roomPayload: any, fallbackHash: string) {
    const group = this.active!;
    if (!group.groupId) throw new Error("GROUP_ID_UNVERIFIED");
    return { officialReader: true, officialTrial: this.options.trial, officialRunId: this.runId,
      groupKey: group.key, groupId: group.groupId, groupIdVerified: true,
      sourceRoomKey: normalizedRoomIdentity(roomPayload) || `unresolved:${fallbackHash}` };
  }
  accept(room: any, result: any) {
    const group = this.active!;
    const kind = verifiedProcessingReceipt(result);
    if (!kind) throw new Error("IMPORT_RECEIPT_UNVERIFIED");
    if (kind === "pending_created") {
      this.totalPending++; group.counters.pending_created++;
      if (result.importType === "UPDATE") group.counters.updated_rooms++;
      else if (result.importType === "CREATE") group.counters.new_rooms++;
      else group.counters.needs_review++;
    } else if (kind === "unchanged") group.counters.unchanged++;
    else group.counters.existing_sources++;
    const id = String(room.markerMessageId);
    const acknowledgement = group.acknowledgements[id] ||= { count: 0, ids: new Set([id]), timestamp: room.markerTimestamp, kind };
    acknowledgement.count++;
    for (const mediaId of [...(room.imageMessageIds || []), ...(room.videoMessageIds || [])]) acknowledgement.ids.add(String(mediaId));
    if (acknowledgement.count === group.sourceSizes[id]) {
      commitSource(group.checkpoint, [...acknowledgement.ids], acknowledgement.timestamp, kind);
      this.save(); // acknowledgement happens AFTER a confirmed API receipt
    }
  }
  fail(code: string, sourceMessageId?: string) {
    if (!this.active) return;
    this.active.counters.failed++;
    this.active.errors.push({ code: /^[A-Z0-9_]{2,80}$/.test(code) ? code : "READER_ERROR", ...(sourceMessageId ? { sourceMessageId } : {}) });
  }
  recordMedia(report: Record<string, any>) {
    if (!this.active) return;
    if (report.partial || report.errorCodes?.length) this.active.counters.media_errors++;
    fs.appendFileSync(path.join(this.options.stateDirectory,"logs",`${this.runId}.jsonl`), JSON.stringify({
      kind:"media", runId:this.runId, groupKey:this.active.key, at:new Date(this.now()).toISOString(), ...report })+"\n");
  }
  async heartbeat() { await this.event("running"); }
  async finishGroup(errorCode?: string) {
    const group = this.active;
    if (!group) return;
    if (errorCode) this.fail(errorCode);
    advanceWatermark(group.checkpoint, group.observed, group.complete);
    const outstanding = group.observed.filter(message => !group.checkpoint.receipts[message.id]).length;
    if (!group.complete) group.checkpoint.scanExpansion = Math.min(1000, (group.checkpoint.scanExpansion || 0) + this.options.maxScrollSteps);
    else group.checkpoint.scanExpansion = 0;
    const status = (errorCode || group.errors[0]?.code) === "LOGIN_REQUIRED" ? "login_required" : group.counters.failed ? "error" : outstanding || !group.complete ? "needs_review" : "idle";
    if (status === "idle") group.checkpoint.lastSuccessAt = new Date(this.now()).toISOString();
    group.counters.unresolved_messages = outstanding;
    this.save();
    await this.event(status, errorCode || group.errors[0]?.code || (!group.complete ? "HISTORY_BOUNDARY_NOT_REACHED" : outstanding ? "UNRESOLVED_MESSAGES" : undefined));
    const summary = { groupKey: group.key, groupName: group.name, groupId: group.groupId, status, counters: group.counters, errors: group.errors,
      coverageComplete: group.complete,
      startedAt: group.startedAt, finishedAt: new Date(this.now()).toISOString(), processedThroughMs: group.checkpoint.processedThroughMs };
    this.summaries.push(summary);
    atomicJson(path.join(this.options.stateDirectory, "runs", `${this.runId}.json`), { runId: this.runId, mode: this.options.trial ? "trial" : "official", groups: this.summaries });
    this.active = null;
  }
}
let session: OfficialSession | null = null;
export function setOfficialSession(value: OfficialSession | null) { session = value; }
export function getOfficialSession() { return session; }
export function safeConsole() {
  const previous = { log: console.log, warn: console.warn, error: console.error };
  for (const method of ["log", "warn", "error"] as const) console[method] = (...args: unknown[]) => previous[method](...args.map(value => {
    if (value instanceof Error) return redactReaderLog(`${value.name}: ${value.message}`);
    if (typeof value === "object") {
      try { return redactReaderLog(JSON.stringify(value, (key, item) => /secret|token|cookie|password|authorization|base64|raw.?text/i.test(key) ? "[omitted]" : item)); } catch { return "[object]"; }
    }
    return redactReaderLog(value);
  }));
  return () => Object.assign(console, previous);
}
