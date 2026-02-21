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

export async function POST() {
  const supabase = await createSupabaseServerClient();

  // 1) Must be logged in (Supabase auth cookies already exist)
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2) Get or create device cookies (httpOnly)
  const cookieStore = await cookies();
  let deviceToken = cookieStore.get(DEVICE_COOKIE)?.value || "";
  let deviceId = cookieStore.get(DEVICE_ID_COOKIE)?.value || "";

  const wasMissing = !deviceToken || !deviceId;

  if (!deviceToken) deviceToken = randomToken(32);
  if (!deviceId) deviceId = randomToken(12);

  // set/refresh cookie TTL (30 days)
  const cookieOptions = {
    httpOnly: true as const,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  // Always ensure cookies exist (if missing we set now)
  if (wasMissing) {
    cookieStore.set({ name: DEVICE_COOKIE, value: deviceToken, ...cookieOptions });
    cookieStore.set({ name: DEVICE_ID_COOKIE, value: deviceId, ...cookieOptions });
  }

  // 3) Register device session in DB (enforce max 2)
  const tokenHash = sha256Base64Url(deviceToken);

  const { data, error } = await supabase.rpc("register_device_session", {
    p_device_id: deviceId,
    p_token_hash: tokenHash,
    p_max_devices: 2,
    p_evict_oldest: true,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const status = (Array.isArray(data) && data[0]?.status) || "unknown";

  if (status === "limit_reached") {
    // hard safety: clear device cookies so this browser can't keep retrying with a "registered" token
    cookieStore.set({ name: DEVICE_COOKIE, value: "", ...cookieOptions, maxAge: 0 });
    cookieStore.set({ name: DEVICE_ID_COOKIE, value: "", ...cookieOptions, maxAge: 0 });

    return NextResponse.json({ ok: false, status }, { status: 403 });
  }

  return NextResponse.json({ ok: true, status }, { status: 200 });
}