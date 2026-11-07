import { canAccessZaloImports } from "@/lib/zalo-import/access";
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

  if (!canAccessZaloImports(user) || levelErr || (level !== 1 && level !== 2)) {
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

    const { count, error: countErr } = await supabase
      .from("pending_room_versions")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", pending.batch_id);
    if (countErr) throw countErr;

    let tempKeys: string[] = [];
    let batchUpdatedAt: string | undefined;
    if (count === 1) {
      const [images, batch] = await Promise.all([
        supabase.from("zalo_import_images").select("temp_r2_key").eq("batch_id", pending.batch_id),
        supabase.from("zalo_import_batches").select("updated_at").eq("id", pending.batch_id).maybeSingle(),
      ]);
      if (images.error) throw images.error;
      if (batch.error) throw batch.error;
      tempKeys = (images.data ?? []).map(image => String(image.temp_r2_key || "").trim()).filter(Boolean);
      batchUpdatedAt = batch.data?.updated_at;
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
      .eq("id", pendingId)
      .eq("status", pending.status)
      .select("id")
      .maybeSingle();

    if (updPending.error) throw updPending.error;
    if (!updPending.data) {
      return NextResponse.json({ ok: false, error: "Import vừa thay đổi. Vui lòng tải lại." }, { status: 409 });
    }

    let deleted = 0;
    if (batchUpdatedAt) {
      // The Reader may already have refreshed this batch after the rejection.
      const updBatch = await supabase.from("zalo_import_batches").update({ status: "Từ chối" })
        .eq("id", pending.batch_id).eq("updated_at", batchUpdatedAt);
      if (updBatch.error) throw updBatch.error;
    }
    if (tempKeys.length) {
      try { deleted = await deleteR2Keys(tempKeys); }
      catch { console.warn("Could not clean up rejected Zalo import images", { batchId: pending.batch_id }); }
    }

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
