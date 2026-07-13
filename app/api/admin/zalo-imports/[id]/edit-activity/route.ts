import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ACTIVE_PROCESSING_WINDOW_MS =
  5 * 60 * 1000;

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

export async function POST(
  _req: Request,
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

    const supabase =
      createSupabaseAdminClient();

    const {
      data: pending,
      error: pendingErr,
    } = await supabase
      .from(
        "pending_room_versions"
      )
      .select(
        [
          "id",
          "status",
          "auto_approve_enabled",
          "auto_approve_at",
          "auto_approve_processing_at",
        ].join(",")
      )
      .eq(
        "id",
        pendingId
      )
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
     * Supabase generated types có thể chưa biết các cột auto_approve_*
     * vừa được thêm bằng SQL. Ép kiểu cục bộ để tránh GenericStringError
     * nhưng vẫn giữ dữ liệu runtime nguyên vẹn.
     */
    const pendingRow =
      pending as unknown as {
        id: string;
        status?: string | null;
        auto_approve_enabled?: boolean | null;
        auto_approve_at?: string | null;
        auto_approve_processing_at?: string | null;
      };

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
          status: 409,
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

    const now =
      new Date().toISOString();

    const hadSchedule =
      Boolean(
        pendingRow.auto_approve_enabled ||
          pendingRow.auto_approve_at
      );

    const {
      error: updateErr,
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
          now,
      })
      .eq(
        "id",
        pendingId
      );

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({
      ok: true,
      pendingId,
      cancelled_auto_approve:
        hadSchedule,
      last_admin_activity_at:
        now,
    });
  } catch (error: any) {
    console.error(
      "pending edit activity failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Edit activity failed",
      },
      {
        status: 500,
      }
    );
  }
}
