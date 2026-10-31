import { timingSafeEqual } from "node:crypto";
import { OFFICIAL_ZALO_GROUPS, readerHealth } from "./official";

export function readerSecretMatches(req: Request) {
  const expected = process.env.ZALO_READER_INTERNAL_SECRET || "";
  const supplied = req.headers.get("x-internal-secret") || "";
  return expected.length > 0 && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
export const READER_COUNTERS = ["missed_intervals","new_messages","new_rooms","updated_rooms","needs_review","pending_created","existing_sources","unchanged","skipped","failed","unresolved_messages","media_errors","skipped_processed","skipped_outside_window","skipped_unanchored","skipped_limit","skipped_invalid","skipped_oversized"];
export function cleanStatusEvent(body: any) {
  const allowed = OFFICIAL_ZALO_GROUPS.find(group => group.key === body.groupKey && group.name === body.groupName);
  if (!allowed || !/^[a-f0-9-]{36}$/i.test(body.runId) || !["trial","official"].includes(body.mode)
    || !["running","idle","error","login_required","needs_review"].includes(body.status)
    || (body.groupId && (!/^g\d{10,30}$/.test(body.groupId) || (allowed.groupId && allowed.groupId !== body.groupId)))) throw new Error("INVALID_STATUS");
  const date = (value: any) => { const time = Date.parse(value); if (!Number.isFinite(time) || time > Date.now()+60000) throw new Error("INVALID_TIME"); return new Date(time).toISOString(); };
  return { run_id: body.runId, group_key: allowed.key, group_id: body.groupId || null, mode: body.mode, status: body.status,
    started_at: date(body.startedAt), heartbeat_at: date(body.heartbeatAt), finished_at: body.status === "running" ? null : date(body.heartbeatAt),
    window_from: body.windowFrom ? date(body.windowFrom) : null, window_to: body.windowTo ? date(body.windowTo) : null,
    counters: Object.fromEntries(READER_COUNTERS.map(key => [key, Math.max(0, Math.min(10000000, Math.trunc(Number(body.counters?.[key]) || 0)))])),
    error_code: /^[A-Z0-9_]{2,80}$/.test(body.errorCode || "") ? body.errorCode : null };
}
export async function readReaderStatus(db: any) {
  const groups = await db.from("zalo_reader_groups").select("group_key,group_name,group_id,scheduler_enabled,next_expected_at");
  if (groups.error) throw groups.error;
  return Promise.all((groups.data || []).map(async (group: any) => {
    const run = await db.from("zalo_reader_runs").select("run_id,mode,status,started_at,heartbeat_at,finished_at,counters,error_code")
      .eq("group_key", group.group_key).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (run.error) throw run.error;
    const health = readerHealth(run.data);
    if(group.scheduler_enabled && group.next_expected_at) health.nextAt=group.next_expected_at;
    return { ...group, run: run.data, health, manualCommand: "npm run zalo-reader:production" };
  }));
}
