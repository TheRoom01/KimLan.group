import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteR2Keys } from "@/lib/r2/zalo-temp";

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

  return { ok: true as const, user };
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

    if (!pendingId) {
      return NextResponse.json(
        { ok: false, error: "Missing pending id" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim();

    const supabase = createSupabaseAdminClient();

    const { data: pending, error: pendingErr } = await supabase
      .from("pending_room_versions")
      .select("id,batch_id,status")
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

    const { data: images, error: imgErr } = await supabase
      .from("zalo_import_images")
      .select("temp_r2_key")
      .eq("batch_id", pending.batch_id);

    if (imgErr) throw imgErr;

    const tempKeys = (images ?? [])
      .map((x: any) => String(x.temp_r2_key || "").trim())
      .filter(Boolean);

    let deleted = 0;

    if (tempKeys.length > 0) {
      deleted = await deleteR2Keys(tempKeys);
    }

    const now = new Date().toISOString();

    const updPending = await supabase
      .from("pending_room_versions")
      .update({
        status: "Từ chối",
        rejected_at: now,
        rejected_by: admin.user.id,
        reject_reason: reason || null,
      })
      .eq("id", pendingId);

    if (updPending.error) throw updPending.error;

    const updBatch = await supabase
      .from("zalo_import_batches")
      .update({
        status: "Từ chối",
      })
      .eq("id", pending.batch_id);

    if (updBatch.error) throw updBatch.error;

    return NextResponse.json({
      ok: true,
      pendingId,
      batchId: pending.batch_id,
      deletedTempFiles: deleted,
    });
  } catch (e: any) {
    console.error("reject zalo import failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Reject failed" },
      { status: 500 }
    );
  }
}