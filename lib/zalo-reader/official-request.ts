import { createHash } from "node:crypto";
import { allowedOfficialGroup } from "./official";
import { normalizedRoomIdentity } from "../zalo-import/room-comparison";

function uuid(hex: string) { return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; }
export function officialSourceIdentity(input: { groupName: string; groupId: string; sourceMessageId: string; sourceRoomKey: string; trial: boolean; runId: string; verified: boolean }, room: Record<string, any>) {
  const group = allowedOfficialGroup(input.groupName, input.groupId);
  if (!group || !input.verified || !/^[A-Za-z0-9:_-]{1,128}$/.test(input.sourceMessageId) || !/^[0-9a-f-]{36}$/i.test(input.runId)) throw new Error("OFFICIAL_SOURCE_UNVERIFIED");
  const key = normalizedRoomIdentity(room);
  if (key ? key !== input.sourceRoomKey : !/^unresolved:[a-f0-9]{64}$/i.test(input.sourceRoomKey)) throw new Error("OFFICIAL_ROOM_KEY_INVALID");
  const identity = JSON.stringify(["zalo-official-v1", input.trial ? "trial" : "official", input.groupId, input.sourceMessageId, input.sourceRoomKey]);
  const hash = (kind: string) => createHash("sha256").update(`${kind}:${identity}`).digest("hex");
  return { sourceHash: hash("source"), batchId: uuid(hash("batch")), pendingId: uuid(hash("pending")),
    metadata: { group_key: group.key, group_id: input.groupId, source_message_id: input.sourceMessageId, source_room_key: input.sourceRoomKey,
      trial: input.trial, run_id: input.runId, verified: true } };
}
export async function confirmOfficialRun(supabase: any, identity: ReturnType<typeof officialSourceIdentity>, sentAt: string | null) {
  const result = await supabase.from("zalo_reader_runs").select("group_id,status,mode,window_from,window_to").eq("run_id", identity.metadata.run_id).eq("group_key", identity.metadata.group_key).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || result.data.status !== "running" || result.data.group_id !== identity.metadata.group_id || result.data.mode !== (identity.metadata.trial ? "trial" : "official")) throw new Error("OFFICIAL_RUN_UNVERIFIED");
  const timestamp = Date.parse(sentAt || "");
  if (!Number.isFinite(timestamp) || !(timestamp >= Date.parse(result.data.window_from) && timestamp <= Date.parse(result.data.window_to))) throw new Error("OFFICIAL_SOURCE_OUTSIDE_WINDOW");
}
export async function existingOfficialReceipt(supabase: any, identity: ReturnType<typeof officialSourceIdentity>, groupName: string, room: any) {
  const rows = await supabase.from("zalo_import_batches").select("id,status,parser_result")
    .eq("group_name", groupName).eq("source_message_id", identity.metadata.source_message_id);
  if (rows.error) throw rows.error;
  const key = normalizedRoomIdentity(room);
  for (const batch of rows.data || []) {
    const parsed = batch.parser_result || {};
    const canonical = batch.id === identity.batchId;
    const legacy = !identity.metadata.trial && !parsed.test_import && !parsed.room_payload?.is_test_import && key && normalizedRoomIdentity(parsed.room_payload || {}) === key;
    const equivalentTest = identity.metadata.trial && parsed.official_source?.trial === true && parsed.official_source?.group_id === identity.metadata.group_id && key && normalizedRoomIdentity(parsed.room_payload || {}) === key;
    if (!canonical && !legacy && !equivalentTest) continue;
    const pending = await supabase.from("pending_room_versions").select("id,status").eq("batch_id", batch.id).maybeSingle();
    if (pending.error) throw pending.error;
    if (!pending.data) throw new Error("IMPORTED_HISTORY_WITHOUT_PENDING_REQUIRES_REVIEW");
    return { ok: true, duplicate: true, batchId: batch.id, pendingVersionId: pending.data.id, status: pending.data.status,
      officialTrial: identity.metadata.trial,
      imageCount: Number(parsed.imported_media?.image_count || 0), videoCount: Number(parsed.imported_media?.video_count || 0),
      importType: parsed.room_payload?._room_import?.type || "NEEDS_REVIEW", partial: Boolean(parsed.import_diagnostics?.has_errors) };
  }
  return null;
}
