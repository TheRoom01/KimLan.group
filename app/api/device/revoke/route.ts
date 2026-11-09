import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body?.sessionId ?? "").trim();

  if (!/^[1-9][0-9]{0,18}$/.test(sessionId)) {
    return NextResponse.json(
      { ok: false, error: "missing_session_id" },
      { status: 400 }
    );
  }

  // 🔥 revoke device
  const { data, error } = await supabase.rpc("revoke_device_session_by_id", {
    p_session_id: sessionId,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (result?.status !== "ok") {
    return NextResponse.json(
      { ok: false, error: "Thiết bị này đã đăng xuất hoặc không còn trong danh sách." },
      { status: 409 }
    );
  }

  // Trả lại danh sách sau khi đăng xuất.
  const { data: devices, error: listError } = await supabase.rpc("list_device_sessions");
  if (listError) {
    return NextResponse.json({ ok: false, error: listError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    revoked: sessionId,
    devices: devices || [],
  });
}
