import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteR2Keys } from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

const AUTO_APPROVE_DELAY_MS =
  3 * 60 * 1000;

const ACTIVE_PROCESSING_WINDOW_MS =
  5 * 60 * 1000;


type PendingDraftRow = {
  id: string;
  batch_id: string;
  status: string | null;
  matched_room_id: string | null;
  room_payload: Record<string, any> | null;
  detail_payload: Record<string, any> | null;
  draft_revision: number | null;
  auto_approve_processing_at: string | null;
};

type PendingImageRow = {
  id: string;
  temp_r2_key?: string | null;
  temp_image_url?: string | null;
  sort_order?: number | null;
};

type PendingVideoRow = {
  id: string;
  temp_r2_key?: string | null;
  temp_video_url?: string | null;
  sort_order?: number | null;
};

type IncomingMediaOrder = {
  id?: unknown;
  sort_order?: unknown;
};

type IncomingNewMedia = {
  type?: unknown;
  url?: unknown;
  temp_r2_key?: unknown;
  sort_order?: unknown;
};

type BatchParserRow = {
  parser_result: Record<string, any> | null;
};

async function assertAdmin() {
  const supabaseUser =
    await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  const {
    data: levelData,
    error: levelErr,
  } = await supabaseUser.rpc(
    "get_my_admin_level"
  );

  const level = Number(
    levelData ?? 0
  );

  if (
    levelErr ||
    (level !== 1 && level !== 2)
  ) {
    return {
      ok: false as const,
      status: 403,
      error: "Forbidden",
    };
  }

  return {
    ok: true as const,
    user,
  };
}

function stableValue(
  value: any
): any {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    typeof value === "object"
  ) {
    return Object.keys(value)
      .sort()
      .reduce(
        (
          output:
            Record<string, any>,
          key
        ) => {
          output[key] =
            stableValue(
              value[key]
            );

          return output;
        },
        {}
      );
  }

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function comparableSubset(
  currentValue: any,
  incomingValue: any
) {
  const current =
    currentValue &&
    typeof currentValue === "object"
      ? currentValue
      : {};

  const incoming =
    incomingValue &&
    typeof incomingValue === "object"
      ? incomingValue
      : {};

  const output:
    Record<string, any> = {};

  for (
    const key of
    Object.keys(incoming).sort()
  ) {
    output[key] =
      stableValue(
        current[key]
      );
  }

  return output;
}

function hasObjectChanged(
  currentValue: any,
  incomingValue: any
) {
  const currentComparable =
    comparableSubset(
      currentValue,
      incomingValue
    );

  const incomingComparable =
    stableValue(
      incomingValue
    );

  return (
    JSON.stringify(
      currentComparable
    ) !==
    JSON.stringify(
      incomingComparable
    )
  );
}

function inferR2KeyFromPublicUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return decodeURIComponent(
      parsed.pathname.replace(/^\/+/, "")
    );
  } catch {
    return raw.replace(/^\/+/, "");
  }
}

function normalizeSortOrder(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.floor(parsed))
    : fallback;
}

function isProcessingActive(
  value: unknown
) {
  const timestamp =
    new Date(
      String(value || "")
    ).getTime();

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp <
      ACTIVE_PROCESSING_WINDOW_MS
  );
}

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const admin =
      await assertAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: admin.error,
        },
        {
          status: admin.status,
        }
      );
    }

    const { id } =
      await params;

    const pendingId =
      String(id || "").trim();

    if (!pendingId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing pending id",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await req
        .json()
        .catch(() => ({}));

    const roomPayload =
      body?.room_payload;

    const detailPayload =
      body?.detail_payload;

    const hasImageOrder =
      Array.isArray(
        body?.images
      );

    const imageOrder:
      IncomingMediaOrder[] =
      hasImageOrder
        ? (body.images as IncomingMediaOrder[])
        : [];

    const hasVideoOrder = Array.isArray(body?.videos);
    const videoOrder: IncomingMediaOrder[] = hasVideoOrder
      ? (body.videos as IncomingMediaOrder[])
      : [];

    const newMedia: IncomingNewMedia[] = Array.isArray(body?.new_media)
      ? (body.new_media as IncomingNewMedia[])
          .filter((item) => item && typeof item === "object")
          .slice(0, 100)
      : [];

    const removedImageIds:
      string[] =
      Array.isArray(
        body?.removed_image_ids
      )
        ? body.removed_image_ids
            .map(
              (value: any) =>
                String(
                  value || ""
                ).trim()
            )
            .filter(Boolean)
        : [];

    const removedVideoIds: string[] = Array.isArray(body?.removed_video_ids)
      ? body.removed_video_ids
          .map((value: any) => String(value || "").trim())
          .filter(Boolean)
      : [];

    if (
      !roomPayload ||
      typeof roomPayload !==
        "object"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing room_payload",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !detailPayload ||
      typeof detailPayload !==
        "object"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing detail_payload",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      createSupabaseAdminClient();

    const {
      data: pending,
      error: pendingErr,
    } = await supabase
      .from(
        "pending_room_versions"
      )
      .select("*")
      .eq("id", pendingId)
      .maybeSingle();

    if (pendingErr) {
      throw pendingErr;
    }

    if (!pending) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không tìm thấy pending import",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Database types hiện tại chưa có các cột auto_approve_* mới.
     * Cast cục bộ sau khi đã kiểm tra pending tồn tại để TypeScript
     * không suy luận kết quả thành GenericStringError.
     */
    const pendingRow =
      pending as unknown as PendingDraftRow;

    if (
      [
        "Đã duyệt",
        "Từ chối",
        "Hết hạn",
      ].includes(
        String(
          pendingRow.status
        )
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Import đã ở trạng thái ${pendingRow.status}`,
        },
        {
          status: 400,
        }
      );
    }

    if (
      isProcessingActive(
        pendingRow.auto_approve_processing_at
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Phòng đang được tự duyệt. Vui lòng tải lại danh sách.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: currentImages,
      error: currentImagesErr,
    } = await supabase
      .from(
        "zalo_import_images"
      )
      .select(
        "id,temp_r2_key,sort_order"
      )
      .eq(
        "batch_id",
        pendingRow.batch_id
      )
      .order(
        "sort_order",
        {
          ascending: true,
        }
      );

    if (currentImagesErr) {
      throw currentImagesErr;
    }

    const currentImageRows:
      PendingImageRow[] =
      Array.isArray(
        currentImages
      )
        ? (currentImages as unknown as PendingImageRow[])
        : [];

    const {
      data: currentVideos,
      error: currentVideosErr,
    } = await supabase
      .from("zalo_import_videos")
      .select("id,temp_r2_key,temp_video_url,sort_order")
      .eq("batch_id", pendingRow.batch_id)
      .order("sort_order", { ascending: true });

    if (currentVideosErr) {
      throw currentVideosErr;
    }

    const currentVideoRows: PendingVideoRow[] = Array.isArray(currentVideos)
      ? (currentVideos as unknown as PendingVideoRow[])
      : [];

    const currentImageIds:
      string[] =
      currentImageRows
        .map(
          (image: any) =>
            String(
              image?.id || ""
            ).trim()
        )
        .filter(Boolean);

    const currentImageIdSet =
      new Set(
        currentImageIds
      );

    const currentVideoIds = currentVideoRows
      .map((video: any) => String(video?.id || "").trim())
      .filter(Boolean);

    const currentVideoIdSet = new Set(currentVideoIds);

    const requestedImageIds:
      string[] =
      hasImageOrder
        ? imageOrder
            .map(
              (image: any) =>
                String(
                  image?.id || ""
                ).trim()
            )
            .filter(Boolean)
        : [
            ...currentImageIds,
          ];

    const requestedVideoIds: string[] = hasVideoOrder
      ? videoOrder
          .map((video: any) => String(video?.id || "").trim())
          .filter(Boolean)
      : [...currentVideoIds];

    if (
      new Set(
        requestedImageIds
      ).size !==
      requestedImageIds.length
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Danh sách ảnh có ID bị trùng.",
        },
        {
          status: 400,
        }
      );
    }

    if (new Set(requestedVideoIds).size !== requestedVideoIds.length) {
      return NextResponse.json(
        { ok: false, error: "Danh sách video có ID bị trùng." },
        { status: 400 }
      );
    }

    const unknownImageIds =
      requestedImageIds.filter(
        (imageId: string) =>
          !currentImageIdSet.has(
            imageId
          )
      );

    if (
      unknownImageIds.length >
      0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Có ảnh không thuộc pending import này.",
        },
        {
          status: 400,
        }
      );
    }

    const unknownVideoIds = requestedVideoIds.filter(
      (videoId) => !currentVideoIdSet.has(videoId)
    );

    if (unknownVideoIds.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Có video không thuộc pending import này." },
        { status: 400 }
      );
    }

    const effectiveRemovedIds:
      string[] =
      Array.from(
        new Set<string>([
          ...removedImageIds.filter(
            (imageId: string) =>
              currentImageIdSet.has(
                imageId
              )
          ),

          ...(hasImageOrder
            ? currentImageIds.filter(
                (imageId: string) =>
                  !requestedImageIds.includes(
                    imageId
                  )
              )
            : []),
        ])
      );

    const effectiveRemovedVideoIds = Array.from(
      new Set<string>([
        ...removedVideoIds.filter((videoId) => currentVideoIdSet.has(videoId)),
        ...(hasVideoOrder
          ? currentVideoIds.filter((videoId) => !requestedVideoIds.includes(videoId))
          : []),
      ])
    );

    const normalizedNewMedia = newMedia
      .map((item, index) => {
        const type = String(item?.type || "").trim().toLowerCase();
        const url = String(item?.url || "").trim();
        const tempR2Key =
          String(item?.temp_r2_key || "").trim() || inferR2KeyFromPublicUrl(url);

        return {
          type,
          url,
          temp_r2_key: tempR2Key,
          sort_order: normalizeSortOrder(item?.sort_order, index),
        };
      })
      .filter(
        (item) =>
          (item.type === "image" || item.type === "video") &&
          Boolean(item.url) &&
          Boolean(item.temp_r2_key)
      );

    const roomChanged =
      hasObjectChanged(
        pendingRow
          .room_payload,
        roomPayload
      );

    const detailChanged =
      hasObjectChanged(
        pendingRow
          .detail_payload,
        detailPayload
      );

    const imagesChanged =
      JSON.stringify(currentImageIds) !== JSON.stringify(requestedImageIds) ||
      effectiveRemovedIds.length > 0 ||
      normalizedNewMedia.some((item) => item.type === "image");

    const videosChanged =
      JSON.stringify(currentVideoIds) !== JSON.stringify(requestedVideoIds) ||
      effectiveRemovedVideoIds.length > 0 ||
      normalizedNewMedia.some((item) => item.type === "video");

    const changed =
      roomChanged ||
      detailChanged ||
      imagesChanged ||
      videosChanged;

    const now =
      new Date();

    const nowIso =
      now.toISOString();

    /*
     * Admin đã bấm Lưu nhưng dữ liệu không đổi:
     * - Không đánh dấu edited_by_admin.
     * - Không bật lại lịch tự duyệt.
     * - Bảo đảm lịch cũ đã bị hủy.
     */
    if (!changed) {
      const {
        error:
          noChangeUpdateErr,
      } = await supabase
        .from(
          "pending_room_versions"
        )
        .update({
          auto_approve_enabled:
            false,
          auto_approve_at:
            null,
          auto_approve_processing_at:
            null,
          last_admin_activity_at:
            nowIso,
        })
        .eq(
          "id",
          pendingId
        );

      if (
        noChangeUpdateErr
      ) {
        throw noChangeUpdateErr;
      }

      return NextResponse.json({
        ok: true,
        pendingId,
        changed: false,
        auto_approve_enabled:
          false,
        auto_approve_at:
          null,
        room_payload:
          pendingRow.room_payload ||
          {},
        detail_payload:
          pendingRow.detail_payload ||
          {},
        images:
          currentImageRows,
        videos:
          currentVideoRows,
      });
    }

    /*
     * Đồng bộ ảnh pending:
     * - Ảnh bị bỏ khỏi danh sách sẽ bị xóa khỏi DB và R2.
     * - Ảnh còn lại được cập nhật sort_order.
     */
    if (
      effectiveRemovedIds
        .length > 0
    ) {
      const removableRows =
        currentImageRows.filter(
          (image: any) =>
            effectiveRemovedIds.includes(
              String(
                image?.id || ""
              )
            )
        );

      const removableKeys =
        removableRows
          .map(
            (image: any) =>
              String(
                image
                  ?.temp_r2_key ||
                  ""
              ).trim()
          )
          .filter(Boolean);

      if (
        removableKeys.length >
        0
      ) {
        await deleteR2Keys(
          removableKeys
        );
      }

      const {
        error:
          deleteImagesErr,
      } = await supabase
        .from(
          "zalo_import_images"
        )
        .delete()
        .eq(
          "batch_id",
          pendingRow.batch_id
        )
        .in(
          "id",
          effectiveRemovedIds
        );

      if (
        deleteImagesErr
      ) {
        throw deleteImagesErr;
      }
    }

    if (effectiveRemovedVideoIds.length > 0) {
      const removableVideoRows = currentVideoRows.filter((video) =>
        effectiveRemovedVideoIds.includes(String(video?.id || ""))
      );

      const removableVideoKeys = removableVideoRows
        .map((video) => String(video?.temp_r2_key || "").trim())
        .filter(Boolean);

      if (removableVideoKeys.length > 0) {
        await deleteR2Keys(removableVideoKeys);
      }

      const { error: deleteVideosErr } = await supabase
        .from("zalo_import_videos")
        .delete()
        .eq("batch_id", pendingRow.batch_id)
        .in("id", effectiveRemovedVideoIds);

      if (deleteVideosErr) {
        throw deleteVideosErr;
      }
    }

    const newImageRows = normalizedNewMedia
      .filter((item) => item.type === "image")
      .map((item, index) => ({
        id: randomUUID(),
        batch_id: pendingRow.batch_id,
        temp_r2_key: item.temp_r2_key,
        temp_image_url: item.url,
        sort_order: requestedImageIds.length + index,
      }));

    const newVideoRows = normalizedNewMedia
      .filter((item) => item.type === "video")
      .map((item, index) => ({
        id: randomUUID(),
        batch_id: pendingRow.batch_id,
        temp_r2_key: item.temp_r2_key,
        temp_video_url: item.url,
        sort_order: requestedVideoIds.length + index,
      }));

    if (newImageRows.length > 0) {
      const { error: insertImagesErr } = await supabase
        .from("zalo_import_images")
        .insert(newImageRows);
      if (insertImagesErr) throw insertImagesErr;
    }

    if (newVideoRows.length > 0) {
      const { error: insertVideosErr } = await supabase
        .from("zalo_import_videos")
        .insert(newVideoRows);
      if (insertVideosErr) throw insertVideosErr;
    }

    for (
      let index = 0;
      index <
      requestedImageIds.length;
      index++
    ) {
      const imageId =
        requestedImageIds[
          index
        ];

      const requestedOrder =
        Number(
          imageOrder[
            index
          ]?.sort_order
        );

      const sortOrder =
        Number.isFinite(
          requestedOrder
        )
          ? Math.max(
              0,
              Math.floor(
                requestedOrder
              )
            )
          : index;

      const {
        error:
          imageUpdateErr,
      } = await supabase
        .from(
          "zalo_import_images"
        )
        .update({
          sort_order:
            sortOrder,
        })
        .eq(
          "batch_id",
          pendingRow.batch_id
        )
        .eq(
          "id",
          imageId
        );

      if (
        imageUpdateErr
      ) {
        throw imageUpdateErr;
      }
    }

    for (let index = 0; index < requestedVideoIds.length; index++) {
      const videoId = requestedVideoIds[index];
      const sortOrder = normalizeSortOrder(videoOrder[index]?.sort_order, index);

      const { error: videoUpdateErr } = await supabase
        .from("zalo_import_videos")
        .update({ sort_order: sortOrder })
        .eq("batch_id", pendingRow.batch_id)
        .eq("id", videoId);

      if (videoUpdateErr) {
        throw videoUpdateErr;
      }
    }

    const nextRoomPayload = {
      ...(
        pendingRow.room_payload ||
        {}
      ),
      ...roomPayload,
    };

    const nextDetailPayload = {
      ...(
        pendingRow.detail_payload ||
        {}
      ),
      ...detailPayload,
    };

    const nextRevision =
      Math.max(
        0,
        Number(
          pendingRow.draft_revision ||
            0
        )
      ) + 1;

    const missingRequiredFields =
      [
        [
          "room_code",
          "mã phòng",
        ],
        [
          "house_number",
          "số nhà",
        ],
        [
          "address",
          "tên đường",
        ],
        [
          "district",
          "quận/huyện",
        ],
      ]
        .filter(
          ([key]) =>
            !String(
              (
                nextRoomPayload as any
              )[key] ||
                ""
            ).trim()
        )
        .map(
          (
            [, label]
          ) => label
        );

    let autoApproveReason:
      string | null = null;

    if (
      String(
        pendingRow.status
      ) !== "Chờ duyệt"
    ) {
      autoApproveReason =
        "Phòng không ở trạng thái Chờ duyệt.";
    } else if (
      String(
        pendingRow.matched_room_id ||
          ""
      ).trim()
    ) {
      autoApproveReason =
        "Phòng đang khớp với một phòng đã tồn tại.";
    } else if (
      missingRequiredFields
        .length > 0
    ) {
      autoApproveReason =
        `Còn thiếu ${missingRequiredFields.join(
          ", "
        )}.`;
    }

    const canAutoApprove =
      !autoApproveReason;

    const autoApproveAt =
      canAutoApprove
        ? new Date(
            now.getTime() +
              AUTO_APPROVE_DELAY_MS
          ).toISOString()
        : null;

    const {
      error: updErr,
    } = await supabase
      .from(
        "pending_room_versions"
      )
      .update({
        room_payload:
          nextRoomPayload,
        detail_payload:
          nextDetailPayload,
        draft_revision:
          nextRevision,
        last_admin_activity_at:
          nowIso,
        auto_approve_enabled:
          canAutoApprove,
        auto_approve_at:
          autoApproveAt,
        auto_approve_actor_id:
          canAutoApprove
            ? admin.user.id
            : null,
        auto_approve_processing_at:
          null,
        auto_approve_last_error:
          null,
      })
      .eq(
        "id",
        pendingId
      );

    if (updErr) {
      throw updErr;
    }

    const {
      data: batch,
      error: batchReadErr,
    } = await supabase
      .from(
        "zalo_import_batches"
      )
      .select(
        "parser_result"
      )
      .eq(
        "id",
        pendingRow.batch_id
      )
      .maybeSingle();

    if (batchReadErr) {
      throw batchReadErr;
    }

    const batchRow =
      batch as unknown as BatchParserRow | null;

    const currentParserResult:
      Record<string, any> =
      batchRow?.parser_result &&
      typeof batchRow.parser_result ===
        "object"
        ? batchRow.parser_result
        : {};

    const {
      error:
        batchUpdateErr,
    } = await supabase
      .from(
        "zalo_import_batches"
      )
      .update({
        parser_result: {
          ...currentParserResult,
          room_payload:
            nextRoomPayload,
          detail_payload:
            nextDetailPayload,
          edited_by_admin:
            true,
          edited_at:
            nowIso,
          draft_revision:
            nextRevision,
          auto_approve_at:
            autoApproveAt,
        },
      })
      .eq(
        "id",
        pendingRow.batch_id
      );

    if (
      batchUpdateErr
    ) {
      throw batchUpdateErr;
    }

    const {
      data: savedImages,
      error:
        savedImagesErr,
    } = await supabase
      .from(
        "zalo_import_images"
      )
      .select("*")
      .eq(
        "batch_id",
        pendingRow.batch_id
      )
      .order(
        "sort_order",
        {
          ascending: true,
        }
      );

    if (savedImagesErr) {
      throw savedImagesErr;
    }

    const { data: savedVideos, error: savedVideosErr } = await supabase
      .from("zalo_import_videos")
      .select("*")
      .eq("batch_id", pendingRow.batch_id)
      .order("sort_order", { ascending: true });

    if (savedVideosErr) {
      throw savedVideosErr;
    }

    return NextResponse.json({
      ok: true,
      pendingId,
      changed: true,
      draft_revision:
        nextRevision,
      auto_approve_enabled:
        canAutoApprove,
      auto_approve_at:
        autoApproveAt,
      auto_approve_reason:
        autoApproveReason,
      room_payload:
        nextRoomPayload,
      detail_payload:
        nextDetailPayload,
      images:
        savedImages ?? [],
      videos:
        savedVideos ?? [],
    });
  } catch (e: any) {
    console.error(
      "save pending draft failed:",
      e
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message ||
          "Save draft failed",
      },
      {
        status: 500,
      }
    );
  }
}
