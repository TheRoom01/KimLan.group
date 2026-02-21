import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEVICE_COOKIE = "pp_device";
const DEVICE_ID_COOKIE = "pp_device_id";

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(input: string) {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ✅ parse body (forceEvict)
  let forceEvict = false;
  try {
    const body = await req.json().catch(() => ({} as any));
    forceEvict = !!body?.forceEvict;
  } catch {
    forceEvict = false;
  }

  const cookieStore = await cookies();
  let deviceToken = cookieStore.get(DEVICE_COOKIE)?.value || "";
  let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value || "";

  const wasMissing = !deviceToken || !deviceId;

  if (!deviceToken) deviceToken = randomToken(32);
  if (!deviceId) deviceId = randomToken(12);

  const cookieOptions = {
    httpOnly: true as const,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  if (wasMissing) {
    cookieStore.set({ name: DEVICE_COOKIE, value: deviceToken, ...cookieOptions });
    cookieStore.set({ name: DEVICE_ID_COOKIE, value: deviceId, ...cookieOptions });
  }

  const tokenHash = sha256Base64Url(deviceToken);

  const { data, error } = await supabase.rpc("register_device_session", {
    p_device_id: deviceId,
    p_token_hash: tokenHash,
    p_max_devices: 2,
    // ✅ mặc định KHÔNG evict, chỉ evict khi user confirm
    p_evict_oldest: forceEvict,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const status = (Array.isArray(data) && data[0]?.status) || "unknown";

  if (status === "limit_reached") {
  // ❌ Không cho login, không evict, chỉ trả 403
  return NextResponse.json(
    {
      ok: false,
      status,
      message:
        "Tài khoản đã đăng nhập trên 2 thiết bị. Vui lòng đăng xuất 1 thiết bị để tiếp tục.",
    },
    { status: 403 }
  );
}
  return NextResponse.json({ ok: true, status }, { status: 200 });
}