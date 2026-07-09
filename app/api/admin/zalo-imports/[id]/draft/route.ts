import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function PATCH(
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

    const roomPayload = body?.room_payload;
    const detailPayload = body?.detail_payload;

    if (!roomPayload || typeof roomPayload !== "object") {
      return NextResponse.json(
        { ok: false, error: "Missing room_payload" },
        { status: 400 }
      );
    }

    if (!detailPayload || typeof detailPayload !== "object") {
      return NextResponse.json(
        { ok: false, error: "Missing detail_payload" },
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

    if (["Đã duyệt", "Từ chối", "Hết hạn"].includes(String(pending.status))) {
      return NextResponse.json(
        { ok: false, error: `Import đã ở trạng thái ${pending.status}` },
        { status: 400 }
      );
    }

    const { error: updErr } = await supabase
      .from("pending_room_versions")
      .update({
        room_payload: roomPayload,
        detail_payload: detailPayload,
      })
      .eq("id", pendingId);

    if (updErr) throw updErr;

    await supabase
      .from("zalo_import_batches")
      .update({
        parser_result: {
          room_payload: roomPayload,
          detail_payload: detailPayload,
          edited_by_admin: true,
          edited_at: new Date().toISOString(),
        },
      })
      .eq("id", pending.batch_id);

    return NextResponse.json({
      ok: true,
      pendingId,
    });
  } catch (e: any) {
    console.error("save pending draft failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message || "Save draft failed" },
      { status: 500 }
    );
  }
}