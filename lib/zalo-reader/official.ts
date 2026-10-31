// Shared allowlist and pure incremental rules. No browser, credentials or DB IO.
export const OFFICIAL_ZALO_GROUPS = [
  { key: "Gio-Hang-Can-Ho-Q1-Q3-Q10", name: "Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠", groupId: "g1986619726266954037" },
  { key: "Gio-Hang-Can-Ho-PN-BT-TB", name: "Giỏ Hàng Căn Hộ PN,BT,TB 🏠", groupId: null },
] as const;
export const READER_INTERVAL_MS = 60 * 60 * 1000;
export type GroupCheckpoint = {
  version: 1; key: string; groupId: string | null; initializedFromMs: number;
  processedThroughMs: number; receipts: Record<string, { timestamp: number; kind: string; anchor?: boolean }>;
  lastAttemptAt?: string; lastSuccessAt?: string; scanExpansion?: number;
};
export function allowedOfficialGroup(name: unknown, id?: unknown) {
  const group = OFFICIAL_ZALO_GROUPS.find(group => group.name === String(name ?? ""));
  if (!group) return null;
  if (id !== undefined && id !== null && (!/^g\d{10,30}$/.test(String(id)) || (group.groupId && id !== group.groupId))) return null;
  return group;
}
export function initializeCheckpoint(key: string, now: number, initialHours = 24): GroupCheckpoint {
  if (!OFFICIAL_ZALO_GROUPS.some(group => group.key === key)) throw new Error("GROUP_NOT_ALLOWED");
  return { version: 1, key, groupId: OFFICIAL_ZALO_GROUPS.find(group => group.key === key)!.groupId,
    initializedFromMs: now - initialHours * READER_INTERVAL_MS, processedThroughMs: now - initialHours * READER_INTERVAL_MS, receipts: {} };
}
export function checkpointWindow(checkpoint: GroupCheckpoint, now: number, overlapMinutes = 15) {
  return { fromMs: Math.max(now - 24 * READER_INTERVAL_MS, checkpoint.initializedFromMs, checkpoint.processedThroughMs - overlapMinutes * 60000), toMs: now };
}
export function verifiedGroupIdentity(key: string, id: string, exactNameVerified: boolean, exactResultCount: number, trustedId: boolean, expectedId?: string | null) {
  const group = OFFICIAL_ZALO_GROUPS.find(group => group.key === key);
  if (!group || !exactNameVerified || exactResultCount !== 1 || !trustedId || !allowedOfficialGroup(group.name, id) || (expectedId && expectedId !== id)) throw new Error(exactResultCount > 1 ? "GROUP_NAME_AMBIGUOUS" : "GROUP_ID_UNVERIFIED");
  return id;
}
export type IncrementalCandidate = { markerMessageId: string; markerTimestamp: number; imageMessageIds?: string[]; videoMessageIds?: string[]; warnings?: string[]; sourceHash: string };
export function selectIncrementalSources<T extends IncrementalCandidate>(rooms: T[], checkpoint: GroupCheckpoint, now: number, maxMessages: number, maxRooms: number, overlapMinutes = 15) {
  const window = checkpointWindow(checkpoint, now, overlapMinutes);
  const grouped = new Map<string, T[]>();
  const excluded: Record<string, number> = { processed: 0, outside_window: 0, invalid: 0, unanchored: 0, limit: 0, oversized: 0 };
  for (const room of [...rooms].sort((a,b) => a.markerTimestamp - b.markerTimestamp || String(a.markerMessageId).localeCompare(String(b.markerMessageId), "en", { numeric: true }) || a.sourceHash.localeCompare(b.sourceHash))) {
    if (!room.markerMessageId || !Number.isSafeInteger(room.markerTimestamp)) { excluded.invalid++; continue; }
    if (room.markerTimestamp < window.fromMs || room.markerTimestamp > window.toMs) { excluded.outside_window++; continue; }
    if (checkpoint.receipts[room.markerMessageId]) { excluded.processed++; continue; }
    if (room.warnings?.some(warning => ["ROOM_MARKER_MISSING", "NO_ROOM_MARKER"].includes(warning))) { excluded.unanchored++; continue; }
    const list = grouped.get(room.markerMessageId) || [];
    if (!list.some(previous => previous.sourceHash === room.sourceHash)) list.push(room);
    grouped.set(room.markerMessageId, list);
  }
  const selected: T[] = []; const sourceSizes: Record<string, number> = {};
  let messages = 0;
  for (const [id, list] of grouped) {
    if (list.length > maxRooms) { excluded.oversized++; continue; }
    if (messages >= maxMessages || selected.length + list.length > maxRooms) { excluded.limit += list.length; continue; }
    selected.push(...list); sourceSizes[id] = list.length; messages++;
  }
  return { rooms: selected, sourceSizes, messages, excluded, window };
}
export function verifiedProcessingReceipt(response: any) {
  if (response?.ok !== true) return null;
  if (response.noChanges === true && response.comparisonStatus === "UNCHANGED") return "unchanged";
  if (typeof response.pendingVersionId === "string" && response.pendingVersionId) return response.duplicate ? "existing_source" : "pending_created";
  return null;
}
export function commitSource(checkpoint: GroupCheckpoint, ids: string[], timestamp: number, kind: string) {
  if (!Number.isSafeInteger(timestamp) || !["unchanged", "pending_created", "existing_source", "non_room"].includes(kind)) throw new Error("UNVERIFIED_CHECKPOINT_ACK");
  for (const id of new Set(ids.filter(Boolean))) checkpoint.receipts[id] = { timestamp, kind, anchor: id === ids[0] };
}
export function advanceWatermark(checkpoint: GroupCheckpoint, observed: Array<{ id: string; timestamp: number }>, complete: boolean) {
  // Never jump over failed, limited, unanchored or unavailable message bodies.
  if (!complete) return checkpoint.processedThroughMs;
  for (const timestamp of [...new Set(observed.map(message => message.timestamp))].sort((a,b) => a-b)) {
    if (timestamp <= checkpoint.processedThroughMs) continue;
    if (observed.some(message => message.timestamp === timestamp && !checkpoint.receipts[message.id])) break;
    checkpoint.processedThroughMs = timestamp;
  }
  return checkpoint.processedThroughMs;
}
export function readerHealth(row: any, now = Date.now()) {
  const last = Date.parse(row?.heartbeat_at || row?.finished_at || row?.started_at || "");
  if (!Number.isFinite(last)) return { state: "waiting", stale: true, nextAt: null };
  const stale = now - last > 2 * READER_INTERVAL_MS;
  return { state: stale ? "error" : row.status === "running" ? "running" : ["error", "login_required", "needs_review"].includes(row.status) ? "error" : "waiting", stale,
    nextAt: new Date(Date.parse(row.finished_at || row.started_at) + READER_INTERVAL_MS).toISOString() };
}
export function redactReaderLog(value: unknown): string {
  return String(value ?? "").replace(/(?:https?:\/\/|blob:|file:\/\/)[^\s"'<>]+/gi, "[URL]")
    .replace(/(?:authorization|cookie|password|internalSecret|access_token|refresh_token|x-internal-secret)\s*[:=].*/gi, "[sensitive field omitted]");
}
