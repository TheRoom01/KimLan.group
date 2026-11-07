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

    let deleted = 0;
    if (count === 0 && pending.batch_id) {
      try {
        const [images, videos] = await Promise.all([
          supabase.from("zalo_import_images").select("temp_r2_key").eq("batch_id", pending.batch_id),
          supabase.from("zalo_import_videos").select("temp_r2_key,temp_thumb_r2_key").eq("batch_id", pending.batch_id),
        ]);
        if (images.error) throw images.error;
        if (videos.error) throw videos.error;
        const tempKeys = [
          ...(images.data ?? []).map(image => image.temp_r2_key),
          ...(videos.data ?? []).flatMap(video => [video.temp_r2_key, video.temp_thumb_r2_key]),
        ].filter((key): key is string => typeof key === "string" && key.length > 0);
        if (tempKeys.length) deleted = await deleteR2Keys(tempKeys);
        // Media rows cascade with the batch. Keep media for sibling rooms.
        const delBatch = await supabase.from("zalo_import_batches").delete().eq("id", pending.batch_id);
        if (delBatch.error) throw delBatch.error;
      } catch (cleanupError) {
        console.warn("Could not clean up removed Zalo import batch", cleanupError);
      }
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
