import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabaseUser = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: levelData, error: levelErr } =
      await supabaseUser.rpc("get_my_admin_level");

    const level = Number(levelData ?? 0);

    if (levelErr || (level !== 1 && level !== 2)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

    const supabase = createSupabaseAdminClient();

    let q = supabase
  .from("pending_room_versions")
  .select(
    `
    *,
    batch:zalo_import_batches(*)
  `,
    { count: "exact" }
  )
  .order("created_at", { ascending: false })
  .range(offset, offset + limit - 1);

    if (status) {
      q = q.eq("status", status);
    }

    const { data, error, count } = await q;

    if (error) throw error;

    const rows = data ?? [];
const batchIds = rows
  .map((r: any) => r.batch_id)
  .filter(Boolean);

let imagesByBatch: Record<string, any[]> = {};

if (batchIds.length > 0) {
  const imgRes = await supabase
    .from("zalo_import_images")
    .select("*")
    .in("batch_id", batchIds)
    .order("sort_order", { ascending: true });

  if (imgRes.error) throw imgRes.error;

  for (const img of imgRes.data ?? []) {
    const bid = String((img as any).batch_id);
    if (!imagesByBatch[bid]) imagesByBatch[bid] = [];
    imagesByBatch[bid].push(img);
  }
}

const finalRows = rows.map((r: any) => ({
  ...r,
  images: imagesByBatch[String(r.batch_id)] ?? [],
}));

    return NextResponse.json({
      ok: true,
      data: finalRows,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e: any) {
    console.error("GET /api/admin/zalo-imports failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load imports" },
      { status: 500 }
    );
  }
}