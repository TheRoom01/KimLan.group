import { randomUUID } from "node:crypto";
import { normalizeRoomStatus, requireAvailabilityDate } from "@/lib/rooms/availability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { copyR2Object, deleteR2Keys, makeRoomImageKey } from "@/lib/r2/zalo-temp";
import { getImportReview, selectedUpdatePatch, stableJson } from "./room-comparison";

export async function updatePendingRoom(params: {
  supabase: SupabaseClient<any, any, any>; pendingId: string; actorUserId: string; selectedFields: string[];
  expectedRoomPayload: Record<string, any>; expectedDetailPayload: Record<string, any>;
}) {
  const { supabase, pendingId, actorUserId, selectedFields } = params;
  const result = await supabase.from("pending_room_versions").select("*,batch:zalo_import_batches(*)").eq("id", pendingId).single();
  if (result.error) throw result.error;
  const pending: any = result.data;
  if (!pending || !["Chờ duyệt", "Trùng phòng"].includes(pending.status)) throw new Error("Pending không còn chờ duyệt.");
  if (pending.room_payload?.is_test_import === true || pending.batch?.parser_result?.test_import === true) throw new Error("Không được duyệt bản nháp TEST vào phòng chính.");
  if (!params.expectedRoomPayload || stableJson(params.expectedRoomPayload) !== stableJson(pending.room_payload) ||
    stableJson(params.expectedDetailPayload || {}) !== stableJson(pending.detail_payload || {})) {
    throw new Error("PENDING_CHANGED: Bản nháp đã đổi kể từ lúc mở so sánh. Hãy tải lại và chọn lại các trường.");
  }
  const review = getImportReview(pending.room_payload);
  if (review?.type !== "UPDATE" || !review.snapshot || review.snapshot.room.id !== pending.matched_room_id) throw new Error("Cần phân tích lại và xác minh phòng UPDATE.");
  const patch = selectedUpdatePatch(pending.room_payload, pending.detail_payload, selectedFields);
  if (Object.hasOwn(patch.room, "status") || Object.hasOwn(patch.room, "available_from")) {
    const status = normalizeRoomStatus(Object.hasOwn(patch.room, "status") ? patch.room.status : review.snapshot.room.status);
    if (!status) throw new Error("Hãy chọn Đang trống, Sắp trống hoặc Đã thuê.");
    requireAvailabilityDate(status, Object.hasOwn(patch.room, "available_from") ? patch.room.available_from : review.snapshot.room.available_from);
    // The transactional RPC reads the stored pending payload. Upgrade legacy
    // labels there with a compare-and-swap; keep the original snapshot intact.
    if (Object.hasOwn(patch.room, "status") && status !== pending.room_payload.status) {
      const canonical = { ...pending.room_payload, status };
      const saved = await supabase.from("pending_room_versions").update({ room_payload: canonical })
        .eq("id", pendingId).eq("room_payload", pending.room_payload).eq("status", pending.status).select("id").single();
      if (saved.error || !saved.data) throw new Error("PENDING_CHANGED: Hãy tải lại bản nháp trước khi duyệt.");
      pending.room_payload = canonical;
    }
  }
  const roomId = pending.matched_room_id;
  const keys: string[] = [];
  const media: any[] = [];
  let rpcAttempted = false;
  try {
    for (const type of ["image", "video"] as const) {
      if (!(type === "image" ? patch.images : patch.videos)) continue;
      const selections = selectedFields.filter(key => key.startsWith(`media:${type}:`));
      const oldIds = selections.filter(key => key.startsWith(`media:${type}:old:`)).map(key => key.split(":")[3]);
      const newIds = selections.filter(key => key.startsWith(`media:${type}:new:`)).map(key => key.split(":")[3]);
      for (const id of oldIds) {
        const old = review.snapshot.media.find(item => item.id === id && item.type === type);
        if (!old) throw new Error("Media cũ không thuộc phòng đang đối chiếu.");
        media.push({ ...old, provider: "r2", _selectionKey: `media:${type}:old:${id}`, sort_order: media.length });
      }
      const rows = await supabase.from(type === "image" ? "zalo_import_images" : "zalo_import_videos")
        .select("*").eq("batch_id", pending.batch_id).eq("selected", true).order("sort_order");
      if (rows.error) throw rows.error;
      const chosenRows = selections.length ? (rows.data || []).filter(row => newIds.includes(String(row.id))) : rows.data || [];
      if (newIds.some(id => !chosenRows.some(row => String(row.id) === id))) throw new Error("Media mới đã thay đổi; hãy tải lại và chọn lại.");
      if (!chosenRows.length && !oldIds.length) throw new Error(`Không có ${type === "image" ? "ảnh" : "video"} mới hợp lệ; không được xóa media cũ vì thiếu nguồn.`);
      for (const row of chosenRows) {
        const extension = String(row.temp_r2_key || "").match(/\.([a-z0-9]+)$/i)?.[1] || (type === "image" ? "webp" : "mp4");
        const toKey = type === "image" ? makeRoomImageKey(roomId, randomUUID(), extension) : `rooms/${roomId}/videos/${randomUUID()}.${extension}`;
        const fromKey = String(row.temp_r2_key || "");
        const manualPrefix = `rooms/zalo-pending-${pendingId}/${type === "image" ? "images" : "videos"}/`;
        if ((!fromKey.startsWith(`zalo-temp/${pending.batch_id}/`) && !fromKey.startsWith(manualPrefix)) || fromKey.includes("..")) throw new Error("Media không thuộc batch Pending này.");
        const mime = extension === "jpg" ? "image/jpeg" : extension === "mov" ? "video/quicktime" : `${type}/${extension}`;
        const copied = await copyR2Object({ fromKey, toKey, contentType: row.mime_type || mime, cacheControl: "public, max-age=31536000, immutable" });
        keys.push(copied.key);
        media.push({ _selectionKey: `media:${type}:new:${row.id}`, type, provider: "r2", url: copied.url, path: copied.url, is_cover: type === "image" && !media.some(item => item.type === "image"), sort_order: selections.length ? media.length : Number(row.sort_order ?? media.length) });
      }
    }
    // Token order is the order in which the administrator selected items.
    const orderedTokens = selectedFields.filter(key => key.startsWith("media:"));
    if (orderedTokens.length) {
      // Reorder by the explicit choice sequence across both sources.
      for (const type of ["image", "video"] as const) {
        const tokens = orderedTokens.filter(key => key.startsWith(`media:${type}:`));
        const items = media.filter(item => item.type === type);
        if (tokens.length) items.forEach(item => { item.sort_order = orderedTokens.indexOf(item._selectionKey); });
      }
    }
    media.sort((a, b) => a.sort_order - b.sort_order);
    media.forEach((item, index) => { item.sort_order = index; item.is_cover = item.type === "image" && media.findIndex(entry => entry.type === "image") === index; delete item._selectionKey; });
    // All DB checks and mutations run in ONE transaction under row locks.
    // No fallback to non-atomic REST updates when the RPC is not installed.
    rpcAttempted = true;
    const applied = await supabase.rpc("approve_zalo_room_update_v1", {
      p_pending_id: pendingId, p_actor_id: actorUserId, p_selected_fields: selectedFields,
      p_expected_payload: pending.room_payload, p_expected_detail: pending.detail_payload || {}, p_media: media,
    });
    if (applied.error) throw applied.error;
    if (applied.data?.roomId !== roomId) throw new Error("UPDATE_RESULT_UNVERIFIED: Chưa xác minh được phòng đã cập nhật; hãy tải lại trước khi thử tiếp.");
    return { roomId, mediaCount: media.length, selectedFields };
  } catch (error: any) {
    // A lost HTTP response may hide a committed transaction. Keep copies then;
    // clean only before the RPC or when SQL explicitly reports a rollback.
    if (keys.length && (!rpcAttempted || /^[0-9A-Z]{5}$/.test(String(error?.code || "")) || error?.code === "PGRST202")) {
      await deleteR2Keys(keys).catch(() => {});
    }
    throw error;
  }
}
