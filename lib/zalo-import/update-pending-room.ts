import { randomUUID } from "node:crypto";
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
  if (review?.type !== "UPDATE" || review.snapshot?.room.id !== pending.matched_room_id) throw new Error("Cần phân tích lại và xác minh phòng UPDATE.");
  const patch = selectedUpdatePatch(pending.room_payload, pending.detail_payload, selectedFields);
  const roomId = pending.matched_room_id;
  const keys: string[] = [];
  const media: any[] = [];
  let rpcAttempted = false;
  try {
    for (const type of ["image", "video"] as const) {
      if (!(type === "image" ? patch.images : patch.videos)) continue;
      const rows = await supabase.from(type === "image" ? "zalo_import_images" : "zalo_import_videos")
        .select("*").eq("batch_id", pending.batch_id).eq("selected", true).order("sort_order");
      if (rows.error) throw rows.error;
      if (!rows.data?.length) throw new Error(`Không có ${type === "image" ? "ảnh" : "video"} mới hợp lệ; không được xóa media cũ vì thiếu nguồn.`);
      for (const row of rows.data) {
        const extension = String(row.temp_r2_key || "").match(/\.([a-z0-9]+)$/i)?.[1] || (type === "image" ? "webp" : "mp4");
        const toKey = type === "image" ? makeRoomImageKey(roomId, randomUUID(), extension) : `rooms/${roomId}/videos/${randomUUID()}.${extension}`;
        const fromKey = String(row.temp_r2_key || "");
        const manualPrefix = `rooms/zalo-pending-${pendingId}/${type === "image" ? "images" : "videos"}/`;
        if ((!fromKey.startsWith(`zalo-temp/${pending.batch_id}/`) && !fromKey.startsWith(manualPrefix)) || fromKey.includes("..")) throw new Error("Media không thuộc batch Pending này.");
        const mime = extension === "jpg" ? "image/jpeg" : extension === "mov" ? "video/quicktime" : `${type}/${extension}`;
        const copied = await copyR2Object({ fromKey, toKey, contentType: row.mime_type || mime, cacheControl: "public, max-age=31536000, immutable" });
        keys.push(copied.key);
        media.push({ type, provider: "r2", url: copied.url, path: copied.url, is_cover: type === "image" && !media.some(item => item.type === "image"), sort_order: Number(row.sort_order ?? media.length) });
      }
    }
    media.sort((a, b) => a.sort_order - b.sort_order);
    media.forEach((item, index) => { item.sort_order = index; });
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
