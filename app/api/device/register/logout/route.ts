import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEVICE_COOKIE = "pp_device";
const DEVICE_ID_COOKIE = "pp_device_id";

function sha256Base64Url(input: string) {
  return crypto.createHash("sha256").update(input).digest("base64url");
}
function isProd() {
  return process.env.NODE_ENV === "production";
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();

  // lấy device token từ httpOnly cookie
  const deviceToken = cookieStore.get(DEVICE_COOKIE)?.value || "";

  // best-effort: revoke session trong DB nếu có token
  if (deviceToken) {
    const tokenHash = sha256Base64Url(deviceToken);
    await supabase.rpc("revoke_device_session", { p_token_hash: tokenHash });
  }

  // clear device cookies (server-side)
  const cookieOptions = {
    httpOnly: true as const,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  cookieStore.set({ name: DEVICE_COOKIE, value: "", ...cookieOptions });
  cookieStore.set({ name: DEVICE_ID_COOKIE, value: "", ...cookieOptions });

  return NextResponse.json({ ok: true }, { status: 200 });
}