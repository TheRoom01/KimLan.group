import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getImportReview } from "./room-comparison";
import { resolveZaloImportRoom } from "./resolve";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  copyR2Object,
  deleteR2Keys,
  makeRoomImageKey,
} from "@/lib/r2/zalo-temp";

type AnySupabase = SupabaseClient<any, any, any>;

type PublishSource =
  | "manual"
  | "auto"
  | "draft_auto";

export type PublishPendingRoomResult = {
  roomId: string;
  mediaCount: number;
  imageCount: number;
  videoCount: number;
};

function normalizeStatus(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized.includes("thuê")) {
    return "Đã thuê";
  }

  if (normalized.includes("sắp")) return "Sắp trống";

  if (
    normalized.includes("trống") ||
    normalized === "trong"
  ) {
    return "Đang trống";
  }

  return (
    String(value || "Đang trống").trim() ||
    "Đang trống"
  );
}

function extFromKey(
  key: string,
  fallback = "webp"
) {
  const match = String(key || "").match(
    /\.([a-zA-Z0-9]+)$/
  );

  return (
    match?.[1]?.toLowerCase() ||
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

function toNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toNullableNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function toBoolean(
  value: unknown,
  fallback: boolean | null = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(
    error || "Unknown error"
  );
}

function buildRoomInsertPayload(params: {
  roomId: string;
  actorUserId: string;
  roomPayload: Record<string, any>;
}) {
  const room = params.roomPayload;

  return {
    id: params.roomId,
    property_id: toNullableString(room.property_id),
    room_code: toNullableString(room.room_code),
    room_type: toNullableString(room.room_type),
    house_number: toNullableString(room.house_number),
    address: toNullableString(room.address),
    ward: toNullableString(room.ward),
    district: toNullableString(room.district),
    price: toNullableNumber(room.price),
    status: normalizeStatus(room.status),
    ...(Object.hasOwn(room, "available_from") ? { available_from: toNullableString(room.available_from) } : {}),
    description: toNullableString(room.description),
    link_zalo: toNullableString(room.link_zalo),
    google_maps_url: toNullableString(room.google_maps_url),
    zalo_phone: toNullableString(room.zalo_phone),
    chinh_sach: toNullableString(room.chinh_sach),
    owner_id: params.actorUserId,
    lat: toNullableNumber(room.lat),
    lng: toNullableNumber(room.lng),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildDetailInsertPayload(params: {
  roomId: string;
  detailPayload: Record<string, any>;
}) {
  const detail = params.detailPayload;

  return {
    id: randomUUID(),
    room_id: params.roomId,
    electric_fee_value: toNullableNumber(
      detail.electric_fee_value
    ),
    electric_fee_unit: toNullableString(
      detail.electric_fee_unit
    ),
    water_fee_value: toNullableNumber(
      detail.water_fee_value
    ),
    water_fee_unit: toNullableString(
      detail.water_fee_unit
    ),
    service_fee_value: toNullableNumber(
      detail.service_fee_value
    ),
    service_fee_unit: toNullableString(
      detail.service_fee_unit
    ),
    parking_fee_value: toNullableNumber(
      detail.parking_fee_value
    ),
    parking_fee_unit: toNullableString(
      detail.parking_fee_unit
    ),
    other_fee_value: toNullableNumber(
      detail.other_fee_value
    ),
    other_fee_note: toNullableString(
      detail.other_fee_note
    ),
    allow_pet: toBoolean(detail.allow_pet, null),
    allow_cat: toBoolean(detail.allow_cat, null),
    allow_dog: toBoolean(detail.allow_dog, null),
    no_pet: toBoolean(detail.no_pet, false),
    short_term: toBoolean(detail.short_term, false),
    long_term: toBoolean(
      detail.long_term,
      true
    ),
    fingerprint_lock: toBoolean(
      detail.fingerprint_lock,
      null
    ),
    free_time: toBoolean(detail.free_time, false),
    has_balcony: toBoolean(detail.has_balcony),
    has_window: toBoolean(detail.has_window),
    has_elevator: toBoolean(
      detail.has_elevator,
      null
    ),
    has_stairs: toBoolean(detail.has_stairs, null),
    shared_washer: toBoolean(
      detail.shared_washer,
      null
    ),
    private_washer: toBoolean(
      detail.private_washer,
      null
    ),
    shared_dryer: toBoolean(
      detail.shared_dryer,
      null
    ),
    private_dryer: toBoolean(
      detail.private_dryer,
      null
    ),
    has_parking: toBoolean(
      detail.has_parking,
      null
    ),
    has_basement: toBoolean(
      detail.has_basement,
      null
    ),
    other_amenities: toNullableString(
      detail.other_amenities
    ),
    detail_json:
      detail.detail_json &&
      typeof detail.detail_json === "object"
        ? detail.detail_json
        : {},
  };
}

async function bestEffortRollback(params: {
  supabase: AnySupabase;
  roomId: string;
  finalKeys: string[];
}) {
  const {
    supabase,
    roomId,
    finalKeys,
  } = params;

  async function ignoreError(
    action: () => PromiseLike<any>
  ) {
    try {
      await action();
    } catch {
      // Rollback best-effort: tiếp tục dọn các phần còn lại.
    }
  }

  await ignoreError(() =>
    supabase
      .from("zalo_import_images")
      .update({
        copied_room_id: null,
        final_r2_key: null,
        final_image_url: null,
      })
      .eq("copied_room_id", roomId)
  );

  await ignoreError(() =>
    supabase
      .from("zalo_import_videos")
      .update({
        copied_room_id: null,
        final_r2_key: null,
        final_video_url: null,
      })
      .eq("copied_room_id", roomId)
  );

  await ignoreError(() =>
    supabase
      .from("room_media")
      .delete()
      .eq("room_id", roomId)
  );

  await ignoreError(() =>
    supabase
      .from("room_details")
      .delete()
      .eq("room_id", roomId)
  );

  await ignoreError(() =>
    supabase
      .from("rooms")
      .delete()
      .eq("id", roomId)
  );

  if (finalKeys.length > 0) {
    await deleteR2Keys(
      Array.from(new Set(finalKeys))
    ).catch(() => {});
  }
}

export async function publishPendingRoom(params: {
  pendingId: string;
  actorUserId: string;
  source: PublishSource;
  supabase?: AnySupabase;
  actorSupabase?: AnySupabase;
}): Promise<PublishPendingRoomResult> {
  const pendingId = String(
    params.pendingId || ""
  ).trim();

  const actorUserId = String(
    params.actorUserId || ""
  ).trim();

  if (!pendingId) {
    throw new Error("Thiếu pendingId.");
  }

  if (!actorUserId) {
    throw new Error(
      "Thiếu actorUserId/ownerId để tạo phòng."
    );
  }

  const supabase =
    params.supabase ||
    createSupabaseAdminClient();

  const {
    data: pending,
    error: pendingError,
  } = await supabase
    .from("pending_room_versions")
    .select(
      `
      *,
      batch:zalo_import_batches(*)
    `
    )
    .eq("id", pendingId)
    .maybeSingle();

  if (pendingError) {
    throw pendingError;
  }

  if (!pending) {
    throw new Error(
      "Không tìm thấy pending import."
    );
  }

  if ((pending as any).room_payload?.is_test_import === true || (pending as any).batch?.parser_result?.test_import === true) {
    throw new Error("Bản nháp TEST chỉ để kiểm tra; không được publish hoặc tạo phòng chính.");
  }
  if (params.source !== "manual" && ((pending as any).room_payload?._reader_manual_review === true || (pending as any).batch?.parser_result?.official_source)) {
    throw new Error("OFFICIAL_MANUAL_REVIEW_REQUIRED: Phòng từ Reader chính thức phải được admin duyệt thủ công.");
  }

  if (
    ["Đã duyệt", "Từ chối", "Hết hạn"].includes(
      String((pending as any).status || "")
    )
  ) {
    throw new Error(
      `Import đã ở trạng thái ${(pending as any).status}.`
    );
  }

  const importReview = getImportReview((pending as any).room_payload);
  if ((pending as any).matched_room_id || (importReview && importReview.type !== "CREATE")) {
    throw new Error("Pending UPDATE/cần xác minh không được tạo phòng mới. Hãy dùng duyệt cập nhật.");
  }
  // Recheck CREATE, including older drafts, immediately before publishing.
  const identityCheck = await resolveZaloImportRoom({ supabase, roomPayload: (pending as any).room_payload || {},
    detailPayload: (pending as any).detail_payload || {}, sourceFieldMap: (pending as any).source_field_map || {}, excludePendingId: pendingId });
  if (identityCheck.roomPayload._room_import?.type !== "CREATE") throw new Error("Phòng hoặc Pending trùng đã xuất hiện. Hãy phân tích lại trước khi duyệt.");

  if (
    params.source !== "manual" &&
    (pending as any).matched_room_id
  ) {
    throw new Error(
      "Pending này đang khớp với phòng đã tồn tại; tự động duyệt không được tạo phòng mới."
    );
  }

  /*
   * draft_auto chỉ được gọi bởi cron sau khi:
   * - admin đã lưu một thay đổi thật;
   * - đủ 3 phút;
   * - cron đã claim bản ghi bằng processing_at.
   *
   * Nguồn "auto" cũ của Zalo Reader vẫn giữ nguyên,
   * không bị buộc phải có lịch 3 phút.
   */
  if (
    params.source ===
    "draft_auto"
  ) {
    const scheduledAt =
      new Date(
        String(
          (pending as any)
            .auto_approve_at ||
            ""
        )
      ).getTime();

    const scheduledActor =
      String(
        (pending as any)
          .auto_approve_actor_id ||
          ""
      ).trim();

    const processingAt =
      String(
        (pending as any)
          .auto_approve_processing_at ||
          ""
      ).trim();

    if (
      String(
        (pending as any)
          .status || ""
      ) !== "Chờ duyệt"
    ) {
      throw new Error(
        "Pending không còn ở trạng thái Chờ duyệt."
      );
    }

    if (
      !(pending as any)
        .auto_approve_enabled
    ) {
      throw new Error(
        "Lịch tự duyệt đã bị hủy."
      );
    }

    if (
      scheduledActor !==
      actorUserId
    ) {
      throw new Error(
        "Admin tự duyệt không khớp với người đã lưu bản nháp."
      );
    }

    if (!processingAt) {
      throw new Error(
        "Pending chưa được cron claim để tự duyệt."
      );
    }

    if (
      !Number.isFinite(
        scheduledAt
      ) ||
      scheduledAt >
        Date.now()
    ) {
      throw new Error(
        "Pending chưa đến thời điểm tự duyệt."
      );
    }
  }

  const batch =
    (pending as any).batch || {};

  const roomPayload = {
    ...((pending as any).room_payload || {}),
  };

  const detailPayload = {
    ...((pending as any).detail_payload || {}),
  };

  if (!String(roomPayload.room_code || "").trim()) {
    throw new Error(
      "Thiếu mã phòng. Vui lòng chỉnh sửa import trước khi duyệt."
    );
  }

  if (!String(roomPayload.house_number || "").trim()) {
    throw new Error(
      "Thiếu số nhà. Vui lòng chỉnh sửa import trước khi duyệt."
    );
  }

  if (!String(roomPayload.address || "").trim()) {
    throw new Error(
      "Thiếu tên đường. Vui lòng chỉnh sửa import trước khi duyệt."
    );
  }

  if (!String(roomPayload.district || "").trim()) {
    throw new Error(
      "Thiếu quận/huyện. Vui lòng chỉnh sửa import trước khi duyệt."
    );
  }

  if (!String(roomPayload.status || "").trim()) {
    throw new Error(
      "Chưa xác định trạng thái phòng. Vui lòng chọn trạng thái trước khi duyệt."
    );
  }

  const roomId = randomUUID();
  const batchId = String(
    (pending as any).batch_id || ""
  ).trim();

  // An intentionally incomplete video-only draft must remain editable without
  // creating a main room/building until the admin has supplied selected media.
  const [imageResult,videoResult] = await Promise.all([
    supabase.from("zalo_import_images").select("*").eq("batch_id",batchId).eq("selected",true).order("sort_order",{ascending:true}),
    supabase.from("zalo_import_videos").select("*").eq("batch_id",batchId).eq("selected",true).order("sort_order",{ascending:true}),
  ]);
  if(imageResult.error) throw imageResult.error;
  if(videoResult.error) throw videoResult.error;
  const images=imageResult.data || [],videos=videoResult.data || [];
  if(![...images,...videos].some((item:any)=>String(item.temp_r2_key || '').trim())) {
    throw new Error(roomPayload._manual_video_required
      ? "Video chưa tải được. Hãy mở Chỉnh sửa, thêm video thủ công và Lưu nháp trước khi Duyệt đăng."
      : "Pending không có ảnh/video đã chọn để đăng.");
  }

  const finalKeys: string[] = [];
  const tempKeysToDelete: string[] = [];
  const mediaRows: any[] = [];

  let imageMediaCount = 0;
  let videoMediaCount = 0;
  let roomCreated = false;

  try {
    if(params.source === "manual" && !params.actorSupabase) throw new Error("Thiếu phiên admin để xác định tòa nhà. Hãy đăng nhập lại và duyệt lại.");
    // Use the exact same authenticated RPC as /admin -> Add room. It resolves
    // the building, asks for ambiguous matches, and creates an unclaimed one
    // only when no building matches. Never call this at Reader import time.
    const roomInsert = params.source === "manual"
      ? await params.actorSupabase!.rpc("admin_upsert_room_v3", {p_room_id:roomId,p_payload:buildRoomInsertPayload({roomId,actorUserId,roomPayload})})
      : await supabase
      .from("rooms")
      .insert(
        buildRoomInsertPayload({
          roomId,
          actorUserId,
          roomPayload,
        })
      )
      .select("id")
      .single();

    if (roomInsert.error) {
      throw roomInsert.error;
    }

    roomCreated = true;
    if(params.source === "manual" && (!roomInsert.data?.property_id || roomInsert.data?.id !== roomId)) throw new Error("Không xác minh được tòa nhà của phòng mới. Hãy tải lại Imports trước khi duyệt lại.");
    if(params.source === "manual") roomPayload.property_id=roomInsert.data.property_id;

    const detailInsert = await supabase
      .from("room_details")
      .insert(
        buildDetailInsertPayload({
          roomId,
          detailPayload,
        })
      );

    if (detailInsert.error) {
      throw detailInsert.error;
    }

    for (const imageRow of images ?? []) {
      const image: any = imageRow;
      const fromKey = String(
        image.temp_r2_key || ""
      ).trim();

      if (!fromKey) continue;

      const extension = extFromKey(
        fromKey,
        "webp"
      );

      const toKey = makeRoomImageKey(
        roomId,
        randomUUID(),
        extension
      );

      const copied = await copyR2Object({
        fromKey,
        toKey,
        contentType:
          image.mime_type ||
          "image/webp",
        cacheControl:
          "public, max-age=31536000, immutable",
      });

      finalKeys.push(copied.key);

      mediaRows.push({
        room_id: roomId,
        provider: "r2",
        type: "image",
        url: copied.url,
        path: copied.url,
        is_cover: mediaRows.length === 0,
        sort_order: Number(image.sort_order ?? mediaRows.length),
      });

      imageMediaCount += 1;
      tempKeysToDelete.push(fromKey);

      const trackingUpdate = await supabase
        .from("zalo_import_images")
        .update({
          copied_room_id: roomId,
          final_r2_key: copied.key,
          final_image_url: copied.url,
        })
        .eq("id", image.id);

      if (trackingUpdate.error) {
        throw trackingUpdate.error;
      }
    }

    for (const videoRow of videos ?? []) {
      const video: any = videoRow;
      const fromKey = String(
        video.temp_r2_key || ""
      ).trim();

      if (!fromKey) continue;

      const extension = extFromKey(
        fromKey,
        "mp4"
      );

      const toKey = makeRoomVideoKey(
        roomId,
        randomUUID(),
        extension
      );

      const copied = await copyR2Object({
        fromKey,
        toKey,
        contentType:
          video.mime_type ||
          (extension === "webm" ? "video/webm" : extension === "mov" ? "video/quicktime" : "video/mp4"),
        cacheControl:
          "public, max-age=31536000, immutable",
      });

      finalKeys.push(copied.key);

      mediaRows.push({
        room_id: roomId,
        provider: "r2",
        type: "video",
        url: copied.url,
        path: copied.url,
        is_cover: mediaRows.length === 0,
        sort_order: Number(video.sort_order ?? mediaRows.length),
      });

      videoMediaCount += 1;
      tempKeysToDelete.push(fromKey);

      const tempThumbKey = String(
        video.temp_thumb_r2_key || ""
      ).trim();

      if (tempThumbKey) {
        tempKeysToDelete.push(tempThumbKey);
      }

      const trackingUpdate = await supabase
        .from("zalo_import_videos")
        .update({
          copied_room_id: roomId,
          final_r2_key: copied.key,
          final_video_url: copied.url,
        })
        .eq("id", video.id);

      if (trackingUpdate.error) {
        throw trackingUpdate.error;
      }
    }

    if (mediaRows.length <= 0) {
      throw new Error(
        "Pending không có ảnh/video đã chọn để đăng."
      );
    }

    mediaRows.sort((a, b) => a.sort_order - b.sort_order);
    mediaRows.forEach((item, index) => { item.sort_order = index; item.is_cover = index === 0; });
    const mediaInsert = await supabase
      .from("room_media")
      .insert(mediaRows);

    if (mediaInsert.error) {
      throw mediaInsert.error;
    }

    const now = new Date().toISOString();

    const currentQuality =
      roomPayload.import_quality &&
      typeof roomPayload.import_quality === "object"
        ? roomPayload.import_quality
        : null;

    const nextQuality = currentQuality
      ? {
          ...currentQuality,
          auto_import: {
            ...(currentQuality.auto_import || {}),
            published: true,
            published_room_id: roomId,
            publish_error: null,
            publish_source: params.source,
            published_at: now,
          },
        }
      : null;

    const nextRoomPayload = {
      ...roomPayload,
      ...(nextQuality
        ? { import_quality: nextQuality }
        : {}),
    };

    const currentParserResult =
      batch.parser_result &&
      typeof batch.parser_result === "object"
        ? batch.parser_result
        : {};

    const nextParserResult = {
      ...currentParserResult,
      room_payload: nextRoomPayload,
      ...(nextQuality
        ? { import_quality: nextQuality }
        : {}),
    };

    const pendingUpdate = await supabase
      .from("pending_room_versions")
      .update({
        status: "Đã duyệt",
        room_payload: nextRoomPayload,
        approved_room_id: roomId,
        approved_at: now,
        approved_by: actorUserId,
        auto_approve_enabled: false,
        auto_approve_at: null,
        auto_approve_actor_id: null,
        auto_approve_processing_at: null,
        auto_approve_last_error: null,
      })
      .eq("id", pendingId);

    if (pendingUpdate.error) {
      throw pendingUpdate.error;
    }

    const batchUpdate = await supabase
      .from("zalo_import_batches")
      .update({
        status: "Đã duyệt",
        parser_result: nextParserResult,
      })
      .eq("id", batchId);

    if (batchUpdate.error) {
      throw batchUpdate.error;
    }

    if (tempKeysToDelete.length > 0) {
      await deleteR2Keys(
        Array.from(
          new Set(tempKeysToDelete)
        )
      ).catch((error) => {
        console.warn(
          "Không xóa hết media Zalo tạm sau khi publish:",
          error
        );
      });
    }

    return {
      roomId,
      mediaCount: mediaRows.length,
      imageCount: imageMediaCount,
      videoCount: videoMediaCount,
    };
  } catch (error) {
    const errorMessage =
      getErrorMessage(
        error
      );

    if (roomCreated) {
      await bestEffortRollback({
        supabase,
        roomId,
        finalKeys,
      });
    }

    const autoFailurePatch =
      params.source ===
      "draft_auto"
        ? {
            auto_approve_enabled:
              false,
            auto_approve_at:
              null,
            auto_approve_actor_id:
              null,
            auto_approve_processing_at:
              null,
            auto_approve_last_error:
              errorMessage,
          }
        : {};

    await Promise.allSettled([
      supabase
        .from("pending_room_versions")
        .update({
          status:
            (pending as any).status,
          room_payload:
            roomPayload,
          approved_room_id: null,
          approved_at: null,
          approved_by: null,
          ...autoFailurePatch,
        })
        .eq("id", pendingId),

      supabase
        .from("zalo_import_batches")
        .update({
          status:
            batch.status ||
            "Chờ duyệt",
          parser_result:
            batch.parser_result ||
            {},
        })
        .eq("id", batchId),
    ]);

    throw error;
  }
}
