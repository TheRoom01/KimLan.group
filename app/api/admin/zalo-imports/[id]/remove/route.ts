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

    const delImages = await supabase
      .from("zalo_import_images")
      .delete()
      .eq("batch_id", pending.batch_id);

    if (delImages.error) throw delImages.error;

    const delPending = await supabase
      .from("pending_room_versions")
      .delete()
      .eq("id", pendingId);

    if (delPending.error) throw delPending.error;

    const { count, error: countErr } = await supabase
      .from("pending_room_versions")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", pending.batch_id);

    if (countErr) throw countErr;

    if (Number(count ?? 0) === 0) {
      const delBatch = await supabase
        .from("zalo_import_batches")
        .delete()
        .eq("id", pending.batch_id);

      if (delBatch.error) throw delBatch.error;
    }

    return NextResponse.json({
      ok: true,
      pendingId,
      batchId: pending.batch_id,
      deletedTempFiles: deleted,
    });
  } catch (e: any) {
    console.error("delete zalo import failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Delete failed" },
      { status: 500 }
    );
  }
}