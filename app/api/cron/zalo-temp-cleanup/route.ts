import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteR2Keys } from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

function checkCronSecret(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  return Boolean(expected && got && expected === got);
}

export async function POST(req: Request) {
  try {
    if (!checkCronSecret(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredPendings, error: pendingErr } = await supabase
      .from("pending_room_versions")
      .select("id,batch_id,status,created_at")
      .lt("created_at", cutoff)
      .in("status", ["Chờ duyệt", "Trùng phòng"]);

    if (pendingErr) throw pendingErr;

    const batchIds = Array.from(
      new Set((expiredPendings ?? []).map((p: any) => p.batch_id).filter(Boolean))
    );

    if (batchIds.length === 0) {
      return NextResponse.json({
        ok: true,
        cutoff,
        expiredPendingCount: 0,
        expiredBatchCount: 0,
        deletedTempFiles: 0,
      });
    }

    const { data: images, error: imgErr } = await supabase
      .from("zalo_import_images")
      .select("id,batch_id,temp_r2_key")
      .in("batch_id", batchIds);

    if (imgErr) throw imgErr;

    const tempKeys = (images ?? [])
      .map((img: any) => String(img.temp_r2_key || "").trim())
      .filter(Boolean);

    let deleted = 0;

    if (tempKeys.length > 0) {
      deleted = await deleteR2Keys(tempKeys);
    }

    const now = new Date().toISOString();

    const updPending = await supabase
      .from("pending_room_versions")
      .update({
        status: "Hết hạn",
        updated_at: now,
      })
      .in(
        "id",
        (expiredPendings ?? []).map((p: any) => p.id)
      );

    if (updPending.error) throw updPending.error;

    const updBatch = await supabase
      .from("zalo_import_batches")
      .update({
        status: "Hết hạn",
        updated_at: now,
      })
      .in("id", batchIds);

    if (updBatch.error) throw updBatch.error;

    return NextResponse.json({
      ok: true,
      cutoff,
      expiredPendingCount: expiredPendings?.length ?? 0,
      expiredBatchCount: batchIds.length,
      deletedTempFiles: deleted,
    });
  } catch (e: any) {
    console.error("zalo-temp-cleanup failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Cleanup failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}