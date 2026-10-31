import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRoomIdentity, getImportReview, normalizedRoomIdentity, sourcePresence, stableJson } from "./room-comparison";

export type ImportBaseline = {
  kind: "pending" | "room" | "history"; id: string;
  room: Record<string, any>; detail: Record<string, any>; images: any[]; videos: any[];
};
export type ChangeAssessment = { status: "CHANGED" | "UNCHANGED" | "UNCERTAIN"; changedFields: string[]; uncertainFields: string[] };

// Compare only fields actually supplied by this new source. Omission never
// means deletion. Media equality requires content hashes, not URL/count alone.
export function assessIncomingChange(input: {
  room: Record<string, any>; detail: Record<string, any>; sourceFields: Record<string, any>;
  baseline: ImportBaseline; imageHashes: Array<string | null>; expectedImages: number;
  videoHashes?: Array<string | null>; expectedVideos: number; hasSourceErrors?: boolean;
}): ChangeAssessment {
  const changedFields: string[] = [], uncertainFields: string[] = [];
  if (classifyRoomIdentity(input.room, [input.baseline.room]).type !== "UPDATE") return { status: "UNCERTAIN", changedFields, uncertainFields: ["identity"] };
  const presence = sourcePresence(input.room, input.detail, input.sourceFields);
  for (const key of Object.keys(presence)) {
    const [scope, field] = key.split(".");
    const newer = (scope === "room" ? input.room : input.detail)[field] ?? null;
    const older = (scope === "room" ? input.baseline.room : input.baseline.detail)[field] ?? null;
    if (stableJson(newer) !== stableJson(older)) changedFields.push(key);
  }
  // These source fields are retained in drafts, but are deliberately not
  // exposed in main-room snapshots. Unknown old values cannot prove equality.
  for (const field of ["zalo_phone", "link_zalo"]) {
    if (!input.sourceFields[field]) continue;
    if (!Object.hasOwn(input.baseline.room, field)) uncertainFields.push(`room.${field}`);
    else if (stableJson(input.room[field]) !== stableJson(input.baseline.room[field])) changedFields.push(`room.${field}`);
  }
  if (input.room.available_from_text && !input.room.available_from && input.room.available_from_text !== input.baseline.room.available_from_text) uncertainFields.push("room.available_from");
  const handled = new Set([...Object.keys(presence).map(key => key.split(".")[1]), "house_number", "address", "district", "room_code", "zalo_phone", "link_zalo", "available_from_text"]);
  for (const field of Object.keys(input.sourceFields)) {
    if (input.sourceFields[field] && !handled.has(field)) uncertainFields.push(`source.${field}`);
  }
  if (!Object.keys(presence).length) uncertainFields.push("source_fields");
  if (input.hasSourceErrors) uncertainFields.push("source_media_errors");

  const compareMedia = (kind: "images" | "videos", expected: number, incoming: Array<string | null>, old: any[]) => {
    if (expected === 0 && incoming.length === 0) return; // no new media information
    if (expected !== incoming.length || incoming.some(hash => !hash)) { uncertainFields.push(kind); return; }
    const previous = old.filter(row => row.selected !== false).map(row => row.content_hash || null);
    if (previous.length !== expected) { changedFields.push(kind); return; }
    if (previous.some(hash => !hash)) { uncertainFields.push(kind); return; }
    if (stableJson([...previous].sort()) !== stableJson([...incoming].sort())) changedFields.push(kind);
  };
  compareMedia("images", input.expectedImages, input.imageHashes, input.baseline.images);
  compareMedia("videos", input.expectedVideos, input.videoHashes || [], input.baseline.videos);
  return { status: changedFields.length ? "CHANGED" : uncertainFields.length ? "UNCERTAIN" : "UNCHANGED", changedFields, uncertainFields };
}

export async function findImportBaseline(supabase: SupabaseClient<any, any, any>, room: Record<string, any>, matchedRoom?: Record<string, any> | null): Promise<ImportBaseline | null> {
  const review = getImportReview(room);
  if (!review?.identity_key || review.candidate_ids.length > 1) return null;
  const fromBatch = async (kind: "pending" | "history", id: string, batchId: string, payload: any, detail: any) => {
    const [images, videos] = await Promise.all([
      supabase.from("zalo_import_images").select("*").eq("batch_id", batchId),
      supabase.from("zalo_import_videos").select("*").eq("batch_id", batchId),
    ]);
    if (images.error) throw images.error;
    if (videos.error) throw videos.error;
    const metadata = getImportReview(payload);
    return { kind, id, room: payload, detail: detail || {},
      images: (images.data || []).map(image => ({ ...image, content_hash: metadata?.image_hashes?.[image.temp_image_url] || null })),
      videos: (videos.data || []).map(video => ({ ...video, content_hash: metadata?.video_hashes?.[video.temp_video_url] || null })),
    };
  };
  if (review.conflicting_pending_ids.length) {
    if (review.conflicting_pending_ids.length !== 1) return null;
    const result = await supabase.from("pending_room_versions").select("*").eq("id", review.conflicting_pending_ids[0]).maybeSingle();
    if (result.error) throw result.error;
    const row: any = result.data;
    if (!row || !["Chờ duyệt", "Trùng phòng", "Cần xác minh"].includes(row.status) || row.room_payload?.is_test_import === true) return null;
    return fromBatch("pending", row.id, row.batch_id, row.room_payload, row.detail_payload);
  }
  if (review.type === "UPDATE" && review.snapshot) {
    // Private values can be compared server-side without adding them to the
    // review snapshot or sending them back to the browser.
    const baselineRoom = matchedRoom && matchedRoom.id === review.snapshot.room.id ? matchedRoom : review.snapshot.room;
    return { kind: "room", id: review.snapshot.room.id, room: baselineRoom, detail: review.snapshot.detail || {},
      images: review.snapshot.media.filter(media => media.type === "image"), videos: review.snapshot.media.filter(media => media.type === "video") };
  }
  if (review.type !== "CREATE") return null;
  // A room may still only exist in import history (rejected/expired draft).
  // Compare to the newest matching source, without reopening that old draft.
  const digits = String(room.house_number || "").match(/\d+/)?.[0];
  if (!digits) return null;
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("zalo_import_batches").select("id,status,parser_result")
      .ilike("parser_result->room_payload->>house_number", `%${digits}%`).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (result.error) throw result.error;
    for (const batch of result.data || []) {
      const parsed = batch.parser_result;
      if (!parsed || parsed.test_import || parsed.room_payload?.is_test_import || normalizedRoomIdentity(parsed.room_payload || {}) !== review.identity_key) continue;
      if (!["Đã duyệt", "Từ chối", "Hết hạn"].includes(batch.status)) {
        const pending = await supabase.from("pending_room_versions").select("id").eq("batch_id", batch.id).maybeSingle();
        if (pending.error) throw pending.error;
        if (!pending.data) continue; // an incomplete/failed batch is not an imported room
      }
      return fromBatch("history", batch.id, batch.id, parsed.room_payload, parsed.detail_payload);
    }
    if ((result.data || []).length < 500) return null;
  }
}
