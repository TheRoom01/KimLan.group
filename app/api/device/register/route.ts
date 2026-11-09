import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEVICE_COOKIE = "pp_device";
const DEVICE_ID_COOKIE = "pp_device_id";

function randomToken(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(input: string) {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const replacement = body?.replaceSessionId == null ? null : String(body.replaceSessionId);
  if (replacement !== null && !/^[1-9][0-9]{0,18}$/.test(replacement)) {
    return NextResponse.json({ ok: false, error: "Thiết bị được chọn không hợp lệ." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(DEVICE_COOKIE)?.value;
  const previousDeviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value;
  let deviceToken = previousToken || randomToken(32);
  const deviceId = previousDeviceId || randomToken(12);

  const ua = req.headers.get("user-agent") || "";
  const platform = req.headers.get("sec-ch-ua-platform") || "";
  const fingerprint = sha256Base64Url([ua, platform, req.headers.get("sec-ch-ua") || ""].join("|"));
  const deviceName = `${platform || "Unknown"} - ${ua.slice(0, 120)}`;
  const register = () => supabase.rpc("admit_device_session", {
    p_device_id: deviceId,
    p_token_hash: sha256Base64Url(deviceToken),
    p_device_fingerprint: fingerprint,
    p_replace_session_id: replacement,
    p_device_name: deviceName,
  });

  let { data, error } = await register();
  if (error?.code === "23505") {
    // A retained browser token can already belong to another account.
    deviceToken = randomToken(32);
    ({ data, error } = await register());
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (result?.status === "unauthorized") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (result?.status === "revoked" || result?.status === "replaced") {
    await supabase.auth.signOut({ scope: "local" });
    cookieStore.delete(DEVICE_COOKIE);
    cookieStore.delete(DEVICE_ID_COOKIE);
    return NextResponse.json({ ok: false, status: result.status }, { status: 403 });
  }
  if (error || (result?.status !== "ok" && result?.status !== "limit_reached")) {
    console.error("Device registration failed", { code: error?.code ?? "UNEXPECTED_STATUS" });
    return NextResponse.json(
      { ok: false, error: "Chưa thể đăng ký thiết bị. Vui lòng thử lại." },
      { status: 500 }
    );
  }

  if (deviceToken !== previousToken || deviceId !== previousDeviceId) {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    };
    cookieStore.set({ name: DEVICE_COOKIE, value: deviceToken, ...cookieOptions });
    cookieStore.set({ name: DEVICE_ID_COOKIE, value: deviceId, ...cookieOptions });
  }

  if (result.status === "limit_reached") {
    const { data: devices, error: devicesError } = await supabase.rpc("list_device_sessions");
    if (devicesError) {
      console.error("Device list failed", { code: devicesError.code });
      return NextResponse.json({ ok: false, error: "Chưa thể tải danh sách thiết bị. Vui lòng thử lại." }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, status: "limit_reached", devices: devices || [], message: "Tài khoản đã đăng nhập trên 2 thiết bị. Chọn một thiết bị để đăng xuất và tiếp tục." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, status: "ok", deviceId });
}
