import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  copyR2Object,
  deleteR2Keys,
  makeRoomImageKey,
} from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

async function assertAdmin() {
  const supabaseUser = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: levelData, error: levelErr } =
    await supabaseUser.rpc("get_my_admin_level");

  const level = Number(levelData ?? 0);

  if (levelErr || (level !== 1 && level !== 2)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user, supabaseUser };
}

function normalizeStatus(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s.includes("thuê")) return "Đã thuê";
  if (s.includes("trống") || s === "trong") return "Trống";
  return String(v || "Trống").trim() || "Trống";
}

function extFromKey(
  key: string,
  fallback = "webp"
) {
  const m = String(key || "").match(
    /\.([a-zA-Z0-9]+)$/
  );

  return (
    m?.[1]?.toLowerCase() ||
    fallback
  );
}

function makeRoomVideoKey(
  roomId: string,
  videoId: string,
  extension = "mp4"
) {
  const safeExtension =
    String(extension || "mp4")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ||
    "mp4";

  return [
    "rooms",
    roomId,
    "videos",
    `${videoId}.${safeExtension}`,
  ].join("/");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await assertAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status }
      );
    }

    const { id } = await params;
    const pendingId = String(id || "").trim();

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "").trim();

    if (!pendingId) {
      return NextResponse.json(
        { ok: false, error: "Missing pending id" },
        { status: 400 }
      );
    }

    if (mode !== "create_room" && mode !== "update_status") {
      return NextResponse.json(
        { ok: false, error: "Invalid mode" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const supabaseUser = admin.supabaseUser;

    const { data: pending, error: pendingErr } = await supabase
      .from("pending_room_versions")
      .select(
        `
        *,
        batch:zalo_import_batches(*)
      `
      )
      .eq("id", pendingId)
      .maybeSingle();

    if (pendingErr) throw pendingErr;

    if (!pending) {
      return NextResponse.json(
        { ok: false, error: "Không tìm thấy pending import" },
        { status: 404 }
      );
    }

    if (["Đã duyệt", "Từ chối", "Hết hạn"].includes(String(pending.status))) {
      return NextResponse.json(
        { ok: false, error: `Import đã ở trạng thái ${pending.status}` },
        { status: 400 }
      );
    }

    const batch = (pending as any).batch || {};
    const roomPayload = { ...((pending as any).room_payload || {}) };
    const detailPayload = { ...((pending as any).detail_payload || {}) };

    if (mode === "update_status") {
      const matchedRoomId = String((pending as any).matched_room_id || "").trim();
      const newStatus = normalizeStatus(roomPayload.status || (pending as any).new_status);

      if (!matchedRoomId) {
        return NextResponse.json(
          { ok: false, error: "Import này không có matched_room_id để cập nhật trạng thái" },
          { status: 400 }
        );
      }

      const { data: oldRoom, error: oldRoomErr } = await supabase
        .from("rooms")
        .select("id,status")
        .eq("id", matchedRoomId)
        .maybeSingle();

      if (oldRoomErr) throw oldRoomErr;

      if (!oldRoom) {
        return NextResponse.json(
          { ok: false, error: "Không tìm thấy phòng đã khớp" },
          { status: 404 }
        );
      }

      const oldStatus = String((oldRoom as any).status || "");

      const upd = await supabaseUser.rpc("update_room_status", {
        p_room_id: matchedRoomId,
        p_status: newStatus,
      });

      if (upd.error) throw upd.error;

      const logIns = await supabase.from("room_status_change_logs").insert({
        room_id: matchedRoomId,
        old_status: oldStatus,
        new_status: newStatus,
        source: "Zalo Import",
        group_name: batch.group_name ?? null,
        sender_name: batch.sender_name ?? null,
        raw_text: batch.raw_text ?? null,
        batch_id: (pending as any).batch_id,
        pending_version_id: pendingId,
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: admin.user.id,
      });

      if (logIns.error) throw logIns.error;

      const now = new Date().toISOString();

      const pendingUpd = await supabase
        .from("pending_room_versions")
        .update({
          status: "Đã duyệt",
          old_status: oldStatus,
          new_status: newStatus,
          approved_room_id: matchedRoomId,
          approved_at: now,
          approved_by: admin.user.id,
        })
        .eq("id", pendingId);

      if (pendingUpd.error) throw pendingUpd.error;

      const batchUpd = await supabase
        .from("zalo_import_batches")
        .update({ status: "Đã duyệt" })
        .eq("id", (pending as any).batch_id);

      if (batchUpd.error) throw batchUpd.error;

      return NextResponse.json({
        ok: true,
        mode,
        roomId: matchedRoomId,
        oldStatus,
        newStatus,
      });
    }

    // =========================
    // mode=create_room
    // =========================

    if (!String(roomPayload.room_code || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Thiếu mã phòng. Vui lòng chỉnh sửa import trước khi duyệt." },
        { status: 400 }
      );
    }

    if (!String(roomPayload.address || "").trim() && !String(roomPayload.house_number || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Thiếu địa chỉ/số nhà. Vui lòng chỉnh sửa import trước khi duyệt." },
        { status: 400 }
      );
    }

    const officialRoomPayload = {
      room_code: roomPayload.room_code ?? "",
      room_type: roomPayload.room_type ?? "",
      house_number: roomPayload.house_number ?? "",
      address: roomPayload.address ?? "",
      ward: roomPayload.ward ?? "",
      district: roomPayload.district ?? "",
      price: Number(roomPayload.price ?? 0),
      status: normalizeStatus(roomPayload.status),
      description: roomPayload.description ?? "",
      link_zalo: roomPayload.link_zalo ?? "",
      zalo_phone: roomPayload.zalo_phone ?? "",
      chinh_sach: roomPayload.chinh_sach ?? "",
      owner_id: admin.user.id,
      lat: roomPayload.lat ?? null,
      lng: roomPayload.lng ?? null,
    };

    const up = await supabaseUser.rpc("admin_upsert_room_v1", {
      p_room_id: null,
      p_payload: officialRoomPayload,
    });

    if (up.error) throw up.error;

    const createdRoom = up.data as any;
    const roomId = String(createdRoom?.id || "").trim();

    if (!roomId) {
      throw new Error("Không lấy được roomId sau khi tạo phòng");
    }

    const detailSave = await supabaseUser.rpc("save_room_details_v1", {
      p_room_id: roomId,
      p_payload: detailPayload,
    });

    if (detailSave.error) throw detailSave.error;

    const batchId = String(
  (pending as any).batch_id || ""
).trim();

/*
 * =========================
 * LẤY ẢNH TẠM
 * =========================
 */
const {
  data: images,
  error: imgErr,
} = await supabase
  .from("zalo_import_images")
  .select("*")
  .eq("batch_id", batchId)
  .eq("selected", true)
  .order("sort_order", {
    ascending: true,
  });

if (imgErr) {
  throw imgErr;
}

/*
 * =========================
 * LẤY VIDEO TẠM
 * =========================
 */
const {
  data: videos,
  error: videoErr,
} = await supabase
  .from("zalo_import_videos")
  .select("*")
  .eq("batch_id", batchId)
  .eq("selected", true)
  .order("sort_order", {
    ascending: true,
  });

if (videoErr) {
  throw videoErr;
}

const mediaRows: any[] = [];

const tempKeysToDelete:
  string[] = [];

let imageMediaCount = 0;
let videoMediaCount = 0;

/*
 * =========================
 * COPY ẢNH SANG THƯ MỤC PHÒNG
 * =========================
 */
for (
  const imageRow of images ?? []
) {
  const img: any = imageRow;

  const fromKey = String(
    img.temp_r2_key || ""
  ).trim();

  if (!fromKey) {
    continue;
  }

  const extension =
    extFromKey(fromKey, "webp");

  const imageId =
    crypto.randomUUID();

  const toKey =
    makeRoomImageKey(
      roomId,
      imageId,
      extension
    );

  const copied =
    await copyR2Object({
      fromKey,
      toKey,

      contentType:
        img.mime_type ||
        "image/webp",

      cacheControl:
        "public, max-age=31536000, immutable",
    });

  const sortOrder =
    mediaRows.length;

  mediaRows.push({
    room_id: roomId,
    provider: "r2",
    type: "image",

    url: copied.url,
    path: copied.url,

    /*
     * Ảnh hợp lệ đầu tiên làm cover.
     */
    is_cover:
      mediaRows.length === 0,

    sort_order:
      sortOrder,
  });

  imageMediaCount += 1;

  tempKeysToDelete.push(
    fromKey
  );

  const imageTrackingUpdate =
    await supabase
      .from("zalo_import_images")
      .update({
        copied_room_id:
          roomId,

        final_r2_key:
          copied.key,

        final_image_url:
          copied.url,
      })
      .eq("id", img.id);

  if (imageTrackingUpdate.error) {
    throw imageTrackingUpdate.error;
  }
}

/*
 * =========================
 * COPY VIDEO SANG THƯ MỤC PHÒNG
 * =========================
 */
for (
  const videoRow of videos ?? []
) {
  const video: any =
    videoRow;

  const fromKey = String(
    video.temp_r2_key || ""
  ).trim();

  if (!fromKey) {
    continue;
  }

  const extension =
    extFromKey(
      fromKey,
      "mp4"
    );

  const videoId =
    crypto.randomUUID();

  const toKey =
    makeRoomVideoKey(
      roomId,
      videoId,
      extension
    );

  const copied =
    await copyR2Object({
      fromKey,
      toKey,

      contentType:
        video.mime_type ||
        "video/mp4",

      cacheControl:
        "public, max-age=31536000, immutable",
    });

  const sortOrder =
    mediaRows.length;

  /*
   * Bình thường phòng có ảnh nên video
   * không làm cover.
   *
   * Nếu phòng hoàn toàn không có ảnh,
   * video đầu tiên được đánh dấu cover
   * để giữ logic media hiện tại.
   */
  const isCover =
    mediaRows.length === 0;

  mediaRows.push({
    room_id: roomId,
    provider: "r2",
    type: "video",

    url: copied.url,
    path: copied.url,

    is_cover: isCover,

    sort_order:
      sortOrder,
  });

  videoMediaCount += 1;

  tempKeysToDelete.push(
    fromKey
  );

  /*
   * Thumbnail video tạm hiện chưa có cột
   * tương ứng trong room_media.
   *
   * UI đang dùng ảnh cover/thumb của phòng,
   * nên sau khi approve có thể xóa thumbnail
   * video tạm.
   */
  const tempThumbKey = String(
    video.temp_thumb_r2_key || ""
  ).trim();

  if (tempThumbKey) {
    tempKeysToDelete.push(
      tempThumbKey
    );
  }

  const videoTrackingUpdate =
    await supabase
      .from(
        "zalo_import_videos"
      )
      .update({
        copied_room_id:
          roomId,

        final_r2_key:
          copied.key,

        final_video_url:
          copied.url,
      })
      .eq("id", video.id);

  if (videoTrackingUpdate.error) {
    throw videoTrackingUpdate.error;
  }
}

/*
 * =========================
 * INSERT CHUNG ẢNH + VIDEO
 * =========================
 */
if (mediaRows.length > 0) {
  const mediaInsert =
    await supabase
      .from("room_media")
      .insert(mediaRows);

  if (mediaInsert.error) {
    throw mediaInsert.error;
  }
}

/*
 * Chỉ xóa file tạm sau khi room_media
 * đã được insert thành công.
 */
if (
  tempKeysToDelete.length > 0
) {
  await deleteR2Keys(
    Array.from(
      new Set(
        tempKeysToDelete
      )
    )
  );
}

    const now = new Date().toISOString();

    const pendingUpd = await supabase
      .from("pending_room_versions")
      .update({
        status: "Đã duyệt",
        approved_room_id: roomId,
        approved_at: now,
        approved_by: admin.user.id,
      })
      .eq("id", pendingId);

    if (pendingUpd.error) throw pendingUpd.error;

    const batchUpd = await supabase
      .from("zalo_import_batches")
      .update({ status: "Đã duyệt" })
      .eq("id", (pending as any).batch_id);

    if (batchUpd.error) throw batchUpd.error;

    return NextResponse.json({
      ok: true,
      mode,
      roomId,

      mediaCount:
        mediaRows.length,

      imageCount:
        imageMediaCount,

      videoCount:
        videoMediaCount,
    });
  } catch (e: any) {
    console.error("approve zalo import failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Approve failed" },
      { status: 500 }
    );
  }
}