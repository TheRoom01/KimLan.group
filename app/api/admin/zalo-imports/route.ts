import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSafeInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, Math.trunc(parsed))
  );
}

export async function GET(req: Request) {
  try {
    const supabaseUser =
      await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
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
      return NextResponse.json(
        {
          ok: false,
          error: "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    const url = new URL(req.url);

    const status =
      url.searchParams.get("status") || "";

    const limit = toSafeInteger(
      url.searchParams.get("limit"),
      20,
      1,
      50
    );

    const offset = toSafeInteger(
      url.searchParams.get("offset"),
      0,
      0,
      1_000_000
    );

    const supabase =
      createSupabaseAdminClient();

    let query = supabase
      .from("pending_room_versions")
      .select(
        `
        *,
        batch:zalo_import_batches(*)
      `,
        {
          count: "exact",
        }
      )
      .order("created_at", {
        ascending: false,
      })
      .range(
        offset,
        offset + limit - 1
      );

    if (status) {
      query = query.eq(
        "status",
        status
      );
    }

    const {
      data,
      error,
      count,
    } = await query;

    if (error) {
      throw error;
    }

    const rows = data ?? [];

    const batchIds = Array.from(
      new Set(
        rows
          .map((row: any) =>
            String(row.batch_id || "").trim()
          )
          .filter(Boolean)
      )
    );

    const imagesByBatch:
      Record<string, any[]> = {};

    const videosByBatch:
      Record<string, any[]> = {};

    if (batchIds.length > 0) {
      const [imageResult, videoResult] =
        await Promise.all([
          supabase
            .from("zalo_import_images")
            .select("*")
            .in("batch_id", batchIds)
            .order("sort_order", {
              ascending: true,
            }),

          supabase
            .from("zalo_import_videos")
            .select("*")
            .in("batch_id", batchIds)
            .order("sort_order", {
              ascending: true,
            }),
        ]);

      if (imageResult.error) {
        throw imageResult.error;
      }

      if (videoResult.error) {
        throw videoResult.error;
      }

      for (const image of imageResult.data ?? []) {
        const batchId = String(
          (image as any).batch_id || ""
        );

        if (!imagesByBatch[batchId]) {
          imagesByBatch[batchId] = [];
        }

        imagesByBatch[batchId].push(image);
      }

      for (const video of videoResult.data ?? []) {
        const batchId = String(
          (video as any).batch_id || ""
        );

        if (!videosByBatch[batchId]) {
          videosByBatch[batchId] = [];
        }

        videosByBatch[batchId].push(video);
      }
    }

    const finalRows = rows.map(
      (row: any) => {
        const batchId = String(
          row.batch_id || ""
        );

        const roomQuality =
          row?.room_payload?.import_quality;

        const batchQuality =
          row?.batch?.parser_result
            ?.import_quality;

        return {
          ...row,
          images:
            imagesByBatch[batchId] ?? [],
          videos:
            videosByBatch[batchId] ?? [],
          import_quality:
            roomQuality ||
            batchQuality ||
            null,
        };
      }
    );

    return NextResponse.json(
      {
        ok: true,
        data: finalRows,
        total: count ?? 0,
        limit,
        offset,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error(
      "GET /api/admin/zalo-imports failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Failed to load imports",
      },
      {
        status: 500,
      }
    );
  }
}
