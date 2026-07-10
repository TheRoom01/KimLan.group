import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteR2Keys } from "@/lib/r2/zalo-temp";

export const runtime = "nodejs";

async function assertAdmin() {
  const supabaseUser = await createSupabaseServerClient();

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: levelData, error: levelErr } =
    await supabaseUser.rpc("get_my_admin_level");

  const level = Number(levelData ?? 0);
  if (levelErr || (level !== 1 && level !== 2)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user };
}

export async function POST(req: Request) {
  try {
    const admin = await assertAdmin();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing ids" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: pendings, error: pendingErr } = await supabase
      .from("pending_room_versions")
      .select("id,batch_id")
      .in("id", ids);

    if (pendingErr) throw pendingErr;

    const batchIds = Array.from(
      new Set((pendings ?? []).map((x: any) => String(x.batch_id)).filter(Boolean))
    );

    if (batchIds.length > 0) {
      const { data: images, error: imgErr } = await supabase
        .from("zalo_import_images")
        .select("temp_r2_key")
        .in("batch_id", batchIds);

      if (imgErr) throw imgErr;

      const tempKeys = (images ?? [])
        .map((x: any) => String(x.temp_r2_key || "").trim())
        .filter(Boolean);

      if (tempKeys.length > 0) {
        await deleteR2Keys(tempKeys);
      }

      const delImages = await supabase
        .from("zalo_import_images")
        .delete()
        .in("batch_id", batchIds);

      if (delImages.error) throw delImages.error;
    }

    const delPending = await supabase
      .from("pending_room_versions")
      .delete()
      .in("id", ids);

    if (delPending.error) throw delPending.error;

    if (batchIds.length > 0) {
      const delBatch = await supabase
        .from("zalo_import_batches")
        .delete()
        .in("id", batchIds);

      if (delBatch.error) throw delBatch.error;
    }

    return NextResponse.json({
      ok: true,
      deleted: ids.length,
    });
  } catch (e: any) {
    console.error("bulk remove zalo imports failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Bulk remove failed" },
      { status: 500 }
    );
  }
}