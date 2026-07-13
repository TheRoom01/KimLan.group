import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

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

  if (
    normalized.includes("trống") ||
    normalized === "trong"
  ) {
    return "Trống";
  }

  return (
    String(value || "Trống").trim() ||
    "Trống"
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
  fallback = false
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
    room_code: toNullableString(room.room_code),
    room_type: toNullableString(room.room_type),
    house_number: toNullableString(room.house_number),
    address: toNullableString(room.address),
    ward: toNullableString(room.ward),
    district: toNullableString(room.district),
    price: toNullableNumber(room.price),
    status: normalizeStatus(room.status),
    description: toNullableString(room.description),
    link_zalo: toNullableString(room.link_zalo),
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
    allow_pet: toBoolean(detail.allow_pet),
    allow_cat: toBoolean(detail.allow_cat),
    allow_dog: toBoolean(detail.allow_dog),
    no_pet: toBoolean(detail.no_pet),
    short_term: toBoolean(detail.short_term),
    long_term: toBoolean(
      detail.long_term,
      true
    ),
    fingerprint_lock: toBoolean(
      detail.fingerprint_lock
    ),
    has_elevator: toBoolean(
      detail.has_elevator
    ),
    has_stairs: toBoolean(detail.has_stairs),
    shared_washer: toBoolean(
      detail.shared_washer
    ),
    private_washer: toBoolean(
      detail.private_washer
    ),
    shared_dryer: toBoolean(
      detail.shared_dryer
    ),
    private_dryer: toBoolean(
      detail.private_dryer
    ),
    has_parking: toBoolean(
      detail.has_parking
    ),
    has_basement: toBoolean(
      detail.has_basement
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

  if (
    ["Đã duyệt", "Từ chối", "Hết hạn"].includes(
      String((pending as any).status || "")
    )
  ) {
    throw new Error(
      `Import đã ở trạng thái ${(pending as any).status}.`
    );
  }

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

  const roomId = randomUUID();
  const batchId = String(
    (pending as any).batch_id || ""
  ).trim();

  const finalKeys: string[] = [];
  const tempKeysToDelete: string[] = [];
  const mediaRows: any[] = [];

  let imageMediaCount = 0;
  let videoMediaCount = 0;
  let roomCreated = false;

  try {
    const roomInsert = await supabase
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

    const {
      data: images,
      error: imageError,
    } = await supabase
      .from("zalo_import_images")
      .select("*")
      .eq("batch_id", batchId)
      .eq("selected", true)
      .order("sort_order", {
        ascending: true,
      });

    if (imageError) {
      throw imageError;
    }

    const {
      data: videos,
      error: videoError,
    } = await supabase
      .from("zalo_import_videos")
      .select("*")
      .eq("batch_id", batchId)
      .eq("selected", true)
      .order("sort_order", {
        ascending: true,
      });

    if (videoError) {
      throw videoError;
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
        sort_order: mediaRows.length,
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
          "video/mp4",
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
        sort_order: mediaRows.length,
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
