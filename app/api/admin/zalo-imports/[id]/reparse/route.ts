import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  detectZaloBuildingCandidates,
  normalizeForCompare,
  parseZaloRoomText,
} from "@/lib/zalo-import/parser";

import { resolveZaloImportRoom } from "@/lib/zalo-import/resolve";

import {
  evaluateZaloImportQuality,
  readZaloAutoImportSettings,
  type ZaloImportIssueLike,
} from "@/lib/zalo-import/quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MANUAL_TEXT_LENGTH =
  40_000;

async function assertAdmin() {
  const supabaseUser =
    await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  const {
    data: levelData,
    error: levelError,
  } = await supabaseUser.rpc(
    "get_my_admin_level"
  );

  const level = Number(
    levelData ?? 0
  );

  if (
    levelError ||
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

function toCount(
  value: unknown,
  fallback: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    0,
    Math.round(parsed)
  );
}

/**
 * Khi Admin đã tự dán lại đúng thông tin tòa nhà/phòng,
 * các cảnh báo text cũ không còn phù hợp.
 *
 * Vẫn giữ:
 * - lỗi tải media;
 * - orphan media;
 * - album/media thiếu;
 * - soft timeline fallback.
 */
function filterIssuesForManualReparse(
  issues: unknown
): ZaloImportIssueLike[] {
  if (!Array.isArray(issues)) {
    return [];
  }

  const supersededPatterns = [
    /\bno house info\b/,
    /\bno_house_info\b/,
    /\broom code missing\b/,
    /\broom_code_missing\b/,
    /\bmedia only\b/,
    /\bmedia_only\b/,
    /\bkhong tim thay thong tin toa nha\b/,
    /\bthieu ma phong\b/,
    /\bkhong tim thay marker phong\b/,
  ];

  return issues.filter(
    (rawIssue: any) => {
      const normalized =
        normalizeForCompare(
          [
            rawIssue?.stage,
            rawIssue?.message,
            rawIssue?.code,
          ]
            .filter(Boolean)
            .join(" ")
        );

      return !supersededPatterns.some(
        (pattern) =>
          pattern.test(normalized)
      );
    }
  );
}

function getDiagnostics(
  pending: any
) {
  return (
    pending?.room_payload
      ?.import_diagnostics ||
    pending?.batch?.parser_result
      ?.import_diagnostics ||
    {}
  );
}

function getManualSourceText(
  pending: any
) {
  return String(
    pending?.room_payload
      ?._manual_reparse
      ?.source_text ||
      pending?.batch?.raw_text ||
      ""
  );
}

function getPreservedRoomMediaFields(
  roomPayload: Record<string, any>
) {
  const source =
    roomPayload || {};

  return {
    media:
      Array.isArray(source.media)
        ? source.media
        : [],

    has_video:
      Boolean(source.has_video),

    video_url:
      source.video_url ??
      null,

    video_urls:
      Array.isArray(
        source.video_urls
      )
        ? source.video_urls
        : [],

    thumb_url:
      source.thumb_url ??
      null,

    import_has_errors:
      Boolean(
        source.import_has_errors
      ),

    import_error_summary:
      source.import_error_summary ??
      null,

    import_diagnostics:
      source.import_diagnostics ??
      null,
  };
}

export async function POST(
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

    const body = await req
      .json()
      .catch(() => ({}));

    const sourceText =
      String(
        body?.sourceText ??
        body?.rawText ??
        ""
      )
        .replace(/\r\n?/g, "\n")
        .trim();

    if (!sourceText) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Hãy dán thông tin của đúng một tòa nhà và một phòng.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      sourceText.length >
      MAX_MANUAL_TEXT_LENGTH
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Nội dung quá dài. Tối đa ${MAX_MANUAL_TEXT_LENGTH.toLocaleString(
              "vi-VN"
            )} ký tự.`,
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
      error: pendingError,
    } = await supabase
      .from(
        "pending_room_versions"
      )
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
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không tìm thấy Pending.",
        },
        {
          status: 404,
        }
      );
    }

    const currentStatus =
      String(
        (pending as any).status ||
        ""
      );

    if (
      [
        "Đã duyệt",
        "Từ chối",
        "Hết hạn",
      ].includes(currentStatus)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Không thể phân tích lại Pending đang ở trạng thái ${currentStatus}.`,
        },
        {
          status: 400,
        }
      );
    }

    const buildingCandidates =
      detectZaloBuildingCandidates(
        sourceText
      );

    if (
      buildingCandidates.length > 1
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "Phát hiện nhiều tòa nhà trong nội dung. Hãy chỉ giữ thông tin của đúng một tòa nhà và một phòng phù hợp với ảnh.",

          code:
            "MULTIPLE_BUILDINGS",

          candidates:
            buildingCandidates,
        },
        {
          status: 422,
        }
      );
    }

    const parsed =
      parseZaloRoomText(
        sourceText
      );

    const resolved =
      await resolveZaloImportRoom({
        supabase,
        roomPayload:
          parsed.roomPayload,
        detailPayload:
          parsed.detailPayload,
      });

    const batch =
      (pending as any).batch ||
      {};

    const batchId =
      String(
        (pending as any)
          .batch_id ||
        batch?.id ||
        ""
      ).trim();

    const [
      imageResult,
      videoResult,
    ] = await Promise.all([
      batchId
        ? supabase
            .from(
              "zalo_import_images"
            )
            .select("*")
            .eq(
              "batch_id",
              batchId
            )
            .order(
              "sort_order",
              {
                ascending: true,
              }
            )
        : Promise.resolve({
            data: [],
            error: null,
          }),

      batchId
        ? supabase
            .from(
              "zalo_import_videos"
            )
            .select("*")
            .eq(
              "batch_id",
              batchId
            )
            .order(
              "sort_order",
              {
                ascending: true,
              }
            )
        : Promise.resolve({
            data: [],
            error: null,
          }),
    ]);

    if (imageResult.error) {
      throw imageResult.error;
    }

    if (videoResult.error) {
      throw videoResult.error;
    }

    const images =
      imageResult.data ?? [];

    const videos =
      videoResult.data ?? [];

    const diagnostics =
      getDiagnostics(
        pending
      );

    const expectedImageCount =
      toCount(
        diagnostics?.expected
          ?.images,
        images.length
      );

    const expectedVideoCount =
      toCount(
        diagnostics?.expected
          ?.videos,
        videos.length
      );

    const importIssues =
      filterIssuesForManualReparse(
        diagnostics?.issues
      );

    const groupName =
      String(
        batch?.group_name ||
        ""
      ).trim();

    const autoImportSettings =
      readZaloAutoImportSettings(
        groupName
      );

    const importQuality =
      evaluateZaloImportQuality({
        roomPayload:
          resolved.roomPayload,

        detailPayload:
          resolved.detailPayload,

        sourceFieldMap:
          parsed.sourceFieldMap,

        inheritedFieldMap:
          resolved
            .inheritedFieldMap,

        matchedRoom:
          resolved.matchedRoom,

        importIssues,

        expectedImageCount,
        expectedVideoCount,

        importedImageCount:
          images.length,

        importedVideoCount:
          videos.length,

        groupName,

        settings:
          autoImportSettings,
      });

    /*
     * Phân tích lại thủ công chỉ cập nhật Pending.
     * Không tự publish ngay trong request này.
     */
    importQuality.auto_import.published =
      false;

    importQuality.auto_import
      .published_room_id = null;

    importQuality.auto_import
      .publish_error = null;

    const manualReparseMeta = {
      source_text:
        sourceText,

      reparsed_at:
        new Date().toISOString(),

      reparsed_by:
        admin.user.id,

      detected_buildings:
        buildingCandidates,
    };

    const oldRoomPayload =
      (
        pending as any
      ).room_payload ||
      {};

    const preservedMedia =
      getPreservedRoomMediaFields(
        oldRoomPayload
      );

    const nextRoomPayload = {
      ...resolved.roomPayload,
      ...preservedMedia,

      import_quality:
        importQuality,

      _manual_reparse:
        manualReparseMeta,
    };

    const nextStatus =
      resolved.matchedRoom
        ? "Trùng phòng"
        : "Chờ duyệt";

    const pendingUpdatePayload = {
      status:
        nextStatus,

      confidence_score:
        importQuality
          .score_fraction,

      room_payload:
        nextRoomPayload,

      detail_payload:
        resolved.detailPayload,

      source_field_map:
        parsed.sourceFieldMap,

      inherited_field_map:
        resolved
          .inheritedFieldMap,

      matched_room_id:
        resolved.matchedRoom
          ?.id ?? null,

      matched_reason:
        resolved.matchedReason ||
        null,

      old_status:
        resolved.matchedRoom
          ?.status ?? null,

      new_status:
        resolved.matchedRoom
          ? resolved.roomPayload
              .status ?? null
          : null,
    };

    const {
      data: updatedPending,
      error: updatePendingError,
    } = await supabase
      .from(
        "pending_room_versions"
      )
      .update(
        pendingUpdatePayload
      )
      .eq(
        "id",
        pendingId
      )
      .select(
        `
        *,
        batch:zalo_import_batches(*)
      `
      )
      .single();

    if (updatePendingError) {
      throw updatePendingError;
    }

    if (batchId) {
      const oldParserResult =
        batch?.parser_result &&
        typeof batch.parser_result ===
          "object"
          ? batch.parser_result
          : {};

      const nextParserResult = {
        ...oldParserResult,

        room_payload:
          nextRoomPayload,

        detail_payload:
          resolved.detailPayload,

        source_field_map:
          parsed.sourceFieldMap,

        inherited_field_map:
          resolved
            .inheritedFieldMap,

        matched_room_id:
          resolved.matchedRoom
            ?.id ?? null,

        matched_reason:
          resolved.matchedReason ||
          null,

        import_quality:
          importQuality,

        manual_reparse:
          manualReparseMeta,
      };

      const {
        error: updateBatchError,
      } = await supabase
        .from(
          "zalo_import_batches"
        )
        .update({
          parser_version:
            "quality-v1-manual",

          parser_result:
            nextParserResult,
        })
        .eq(
          "id",
          batchId
        );

      if (updateBatchError) {
        throw updateBatchError;
      }

      /*
       * Bản pending vừa select ở trên vẫn chứa batch trước update.
       * Gắn parser_result mới vào response để UI hiển thị ngay.
       */
      (updatedPending as any).batch = {
        ...(
          (updatedPending as any)
            .batch ||
          batch
        ),
        parser_version:
          "quality-v1-manual",
        parser_result:
          nextParserResult,
      };
    }

    const finalRow = {
      ...(updatedPending as any),

      images,
      videos,

      import_quality:
        importQuality,

      room_payload:
        nextRoomPayload,

      detail_payload:
        resolved.detailPayload,

      source_field_map:
        parsed.sourceFieldMap,

      inherited_field_map:
        resolved
          .inheritedFieldMap,
    };

    return NextResponse.json(
      {
        ok: true,
        data: finalRow,

        message:
          "Đã phân tích lại dữ liệu. Ảnh và video được giữ nguyên.",

        detected_buildings:
          buildingCandidates,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error(
      "POST /api/admin/zalo-imports/[id]/reparse failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Phân tích lại dữ liệu thất bại.",
      },
      {
        status: 500,
      }
    );
  }
}
