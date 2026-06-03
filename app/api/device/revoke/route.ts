import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: userRes, error: userErr } =
    await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const sessionId = Number(body?.sessionId);

  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "missing_session_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc(
    "revoke_device_session_by_id",
    {
      p_session_id: sessionId,
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    result: data,
  });
}