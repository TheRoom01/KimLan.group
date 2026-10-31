import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishPendingRoom } from "@/lib/zalo-import/publish-pending-room";
import { updatePendingRoom } from "@/lib/zalo-import/update-pending-room";
import { getImportReview } from "@/lib/zalo-import/room-comparison";
import { zaloImportErrorMessage } from "@/lib/zalo-import/error-message";

export const runtime = "nodejs";

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
    supabaseUser,
  };
}

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
    const admin = await assertAdmin();

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

    const { id } = await params;

    const pendingId = String(
      id || ""
    ).trim();

    const body = await req
      .json()
      .catch(() => ({}));

    const mode = String(
      body?.mode || ""
    ).trim();

    if (!pendingId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing pending id",
        },
        {
          status: 400,
        }
      );
    }

    if (
      mode !== "create_room" &&
      mode !== "update_room" &&
      mode !== "update_status"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid mode",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      createSupabaseAdminClient();

    if (mode === "update_room") {
      const updated = await updatePendingRoom({ supabase, pendingId, actorUserId: admin.user.id,
        selectedFields: body?.selectedFields, expectedRoomPayload: body?.expectedRoomPayload, expectedDetailPayload: body?.expectedDetailPayload });
      return NextResponse.json({ ok: true, mode, ...updated });
    }

    if (mode === "create_room") {
      const published =
        await publishPendingRoom({
          pendingId,
          actorUserId:
            admin.user.id,
          source: "manual",
          supabase,
          actorSupabase: admin.supabaseUser,
        });

      return NextResponse.json({
        ok: true,
        mode,
        roomId:
          published.roomId,
        mediaCount:
          published.mediaCount,
        imageCount:
          published.imageCount,
        videoCount:
          published.videoCount,
      });
    }

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

    if (
      [
        "Đã duyệt",
        "Từ chối",
        "Hết hạn",
      ].includes(
        String(
          (pending as any).status ||
            ""
        )
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Import đã ở trạng thái ${(pending as any).status}`,
        },
        {
          status: 400,
        }
      );
    }

    if ((pending as any).room_payload?.is_test_import === true || (pending as any).batch?.parser_result?.test_import === true) {
      return NextResponse.json({ ok: false, error: "Không được duyệt bản nháp TEST vào dữ liệu phòng chính." }, { status: 403 });
    }
    if (getImportReview((pending as any).room_payload)) {
      return NextResponse.json({ ok: false, error: "Hãy mở so sánh và chọn từng trường để duyệt cập nhật." }, { status: 409 });
    }

    const batch =
      (pending as any).batch || {};

    const roomPayload = {
      ...((pending as any)
        .room_payload || {}),
    };

    const matchedRoomId = String(
      (pending as any)
        .matched_room_id || ""
    ).trim();

    const newStatus = normalizeStatus(
      roomPayload.status ||
        (pending as any).new_status
    );

    if (!matchedRoomId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Import này không có matched_room_id để cập nhật trạng thái",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: oldRoom,
      error: oldRoomError,
    } = await supabase
      .from("rooms")
      .select("id,status")
      .eq("id", matchedRoomId)
      .maybeSingle();

    if (oldRoomError) {
      throw oldRoomError;
    }

    if (!oldRoom) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không tìm thấy phòng đã khớp",
        },
        {
          status: 404,
        }
      );
    }

    const oldStatus = String(
      (oldRoom as any).status || ""
    );

    const updateStatus =
      await admin.supabaseUser.rpc(
        roomPayload.available_from ? "update_room_status_admin_v2" : "update_room_status",
        {
          p_room_id:
            matchedRoomId,
          p_status:
            newStatus,
          ...(roomPayload.available_from ? { p_available_from: roomPayload.available_from } : {}),
        }
      );

    if (updateStatus.error) {
      throw updateStatus.error;
    }

    const logInsert = await supabase
      .from(
        "room_status_change_logs"
      )
      .insert({
        room_id:
          matchedRoomId,
        old_status:
          oldStatus,
        new_status:
          newStatus,
        source:
          "Zalo Import",
        group_name:
          batch.group_name ?? null,
        sender_name:
          batch.sender_name ?? null,
        raw_text:
          batch.raw_text ?? null,
        batch_id:
          (pending as any).batch_id,
        pending_version_id:
          pendingId,
        confirmed: true,
        confirmed_at:
          new Date().toISOString(),
        confirmed_by:
          admin.user.id,
      });

    if (logInsert.error) {
      throw logInsert.error;
    }

    const now =
      new Date().toISOString();

    const pendingUpdate = await supabase
      .from("pending_room_versions")
      .update({
        status: "Đã duyệt",
        old_status:
          oldStatus,
        new_status:
          newStatus,
        approved_room_id:
          matchedRoomId,
        approved_at:
          now,
        approved_by:
          admin.user.id,
      })
      .eq("id", pendingId);

    if (pendingUpdate.error) {
      throw pendingUpdate.error;
    }

    const batchUpdate = await supabase
      .from("zalo_import_batches")
      .update({
        status: "Đã duyệt",
      })
      .eq(
        "id",
        (pending as any).batch_id
      );

    if (batchUpdate.error) {
      throw batchUpdate.error;
    }

    return NextResponse.json({
      ok: true,
      mode,
      roomId:
        matchedRoomId,
      oldStatus,
      newStatus,
    });
  } catch (error: any) {
    console.error(
      "approve zalo import failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
          error: zaloImportErrorMessage(error, "Duyệt đăng thất bại. Vui lòng thử lại."),
      },
      {
        status: String(error?.message || "").includes("rooms_status_check") ? 422 : error?.code === "PGRST202" ? 503 : /CHANGED|MISSING|INVALID|PROPERTY_|Pending|chọn|xác minh|TEST/i.test(error?.message || "") ? 409 : 500,
      }
    );
  }
}
