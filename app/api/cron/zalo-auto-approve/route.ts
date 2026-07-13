import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishPendingRoom } from "@/lib/zalo-import/publish-pending-room";

export const runtime = "nodejs";
export const maxDuration = 300;

function checkCronSecret(
  req: Request
) {
  const expected =
    process.env.CRON_SECRET ||
    "";

  const got =
    req.headers.get(
      "x-cron-secret"
    ) ||
    req.headers
      .get(
        "authorization"
      )
      ?.replace(
        /^Bearer\s+/i,
        ""
      ) ||
    "";

  return Boolean(
    expected &&
    got &&
    expected === got
  );
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

function getBatchSize() {
  const configured =
    Number(
      process.env
        .ZALO_DRAFT_AUTO_APPROVE_BATCH_SIZE ||
        10
    );

  if (
    !Number.isFinite(
      configured
    )
  ) {
    return 10;
  }

  return Math.max(
    1,
    Math.min(
      25,
      Math.floor(
        configured
      )
    )
  );
}

async function runAutoApprove(
  req: Request
) {
  try {
    if (
      !checkCronSecret(req)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      createSupabaseAdminClient();

    const now =
      new Date();

    const nowIso =
      now.toISOString();

    const staleLockCutoff =
      new Date(
        now.getTime() -
          10 * 60 * 1000
      ).toISOString();

    /*
     * Giải phóng lock bị treo do function/server dừng giữa chừng.
     */
    await supabase
      .from(
        "pending_room_versions"
      )
      .update({
        auto_approve_processing_at:
          null,
      })
      .eq(
        "auto_approve_enabled",
        true
      )
      .lt(
        "auto_approve_processing_at",
        staleLockCutoff
      );

    const {
      data: dueRows,
      error: dueError,
    } = await supabase
      .from(
        "pending_room_versions"
      )
      .select(
        [
          "id",
          "status",
          "matched_room_id",
          "auto_approve_at",
          "auto_approve_actor_id",
          "auto_approve_processing_at",
        ].join(",")
      )
      .eq(
        "status",
        "Chờ duyệt"
      )
      .eq(
        "auto_approve_enabled",
        true
      )
      .is(
        "matched_room_id",
        null
      )
      .is(
        "auto_approve_processing_at",
        null
      )
      .lte(
        "auto_approve_at",
        nowIso
      )
      .order(
        "auto_approve_at",
        {
          ascending: true,
        }
      )
      .limit(
        getBatchSize()
      );

    if (dueError) {
      throw dueError;
    }

    let claimedCount = 0;
    let publishedCount = 0;
    let skippedCount = 0;

    const errors:
      Array<{
        pendingId: string;
        error: string;
      }> = [];

    for (
      const row of
      dueRows ?? []
    ) {
      const pendingId =
        String(
          (row as any).id ||
            ""
        ).trim();

      const dueAt =
        String(
          (row as any)
            .auto_approve_at ||
            ""
        ).trim();

      const actorUserId =
        String(
          (row as any)
            .auto_approve_actor_id ||
            ""
        ).trim();

      if (
        !pendingId ||
        !dueAt ||
        !actorUserId
      ) {
        skippedCount += 1;

        if (pendingId) {
          await supabase
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
              auto_approve_last_error:
                "Thiếu auto_approve_actor_id hoặc auto_approve_at.",
            })
            .eq(
              "id",
              pendingId
            );
        }

        continue;
      }

      /*
       * Claim có điều kiện:
       * nếu admin vừa mở lại modal và hủy lịch,
       * update này sẽ không trả về bản ghi.
       */
      const claimTime =
        new Date().toISOString();

      const {
        data: claimed,
        error: claimError,
      } = await supabase
        .from(
          "pending_room_versions"
        )
        .update({
          auto_approve_processing_at:
            claimTime,
          auto_approve_last_error:
            null,
        })
        .eq(
          "id",
          pendingId
        )
        .eq(
          "status",
          "Chờ duyệt"
        )
        .eq(
          "auto_approve_enabled",
          true
        )
        .eq(
          "auto_approve_at",
          dueAt
        )
        .is(
          "matched_room_id",
          null
        )
        .is(
          "auto_approve_processing_at",
          null
        )
        .select(
          "id"
        )
        .maybeSingle();

      if (claimError) {
        errors.push({
          pendingId,
          error:
            getErrorMessage(
              claimError
            ),
        });

        continue;
      }

      if (!claimed) {
        skippedCount += 1;
        continue;
      }

      claimedCount += 1;

      try {
        await publishPendingRoom({
          pendingId,
          actorUserId,
          source:
            "draft_auto",
          supabase,
        });

        publishedCount += 1;
      } catch (error) {
        const message =
          getErrorMessage(
            error
          );

        errors.push({
          pendingId,
          error: message,
        });

        /*
         * publishPendingRoom cũng cập nhật lỗi.
         * Đoạn này là fallback nếu lỗi xảy ra trước khi helper kịp xử lý.
         */
        await supabase
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
            auto_approve_last_error:
              message,
          })
          .eq(
            "id",
            pendingId
          );
      }
    }

    return NextResponse.json({
      ok: true,
      checked_at: nowIso,
      due_count:
        dueRows?.length ?? 0,
      claimed_count:
        claimedCount,
      published_count:
        publishedCount,
      skipped_count:
        skippedCount,
      error_count:
        errors.length,
      errors,
    });
  } catch (error: any) {
    console.error(
      "zalo draft auto approve failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Auto approve failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  req: Request
) {
  return runAutoApprove(
    req
  );
}

export async function GET(
  req: Request
) {
  return runAutoApprove(
    req
  );
}
