import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const DEVICE_COOKIE = "pp_device";
const DEVICE_ID_COOKIE = "pp_device_id";

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export async function proxy(request: NextRequest) {
  // Create an initial response
  let response = NextResponse.next();

  // ✅ Guard ENV: thiếu thì fail-open (không crash middleware/proxy)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        response.cookies.set(name, value, options);
      },
      remove(name: string, options: any) {
        // ✅ Xoá cookie đúng cách (maxAge: 0)
        response.cookies.set({
          name,
          value: "",
          ...options,
          maxAge: 0,
        });
      },
    },
  });

  // ✅ Refresh session / sync cookies (không throw làm chết proxy)
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    // noop: fail-open
  }

  // Enforce device limit for authenticated users
  if (userId) {
    // 1) Ensure device cookies exist (httpOnly cookies are set server-side here)
    let deviceToken = request.cookies.get(DEVICE_COOKIE)?.value || "";
    let deviceId = request.cookies.get(DEVICE_ID_COOKIE)?.value || "";

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30d
    };

    if (!deviceToken) {
      deviceToken = randomToken(32);
      response.cookies.set(DEVICE_COOKIE, deviceToken, cookieOptions);
    }
    if (!deviceId) {
      deviceId = randomToken(12);
      response.cookies.set(DEVICE_ID_COOKIE, deviceId, cookieOptions);
    }

   // 2) Validate first (fast path). Only register on first-seen devices.
try {
  const tokenHash = await sha256Base64Url(deviceToken);

  // validate current device is still active (also touches last_seen_at)
  const { data: v1, error: e1 } = await supabase.rpc("validate_device_session", {
    p_token_hash: tokenHash,
  });

  const valid1 = Array.isArray(v1) ? !!v1[0]?.valid : false;

  if (!e1 && valid1) {
    // ✅ steady state: no need to call register on every request
    return response;
  }

  // If not valid yet: treat as first-seen device -> register (may evict oldest)
  await supabase.rpc("register_device_session", {
    p_device_id: deviceId,
    p_token_hash: tokenHash,
    p_max_devices: 2,
    p_evict_oldest: true,
  });

  // validate again after register
  const { data: v2, error: e2 } = await supabase.rpc("validate_device_session", {
    p_token_hash: tokenHash,
  });

  const valid2 = Array.isArray(v2) ? !!v2[0]?.valid : false;

  if (e2 || !valid2) {
    // Kick this device: sign out + clear device cookies + redirect
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    response.cookies.set({ name: DEVICE_COOKIE, value: "", ...cookieOptions, maxAge: 0 });
    response.cookies.set({ name: DEVICE_ID_COOKIE, value: "", ...cookieOptions, maxAge: 0 });

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("auth", "kicked");
    return NextResponse.redirect(redirectUrl);
  }
} catch {
  // fail-open: don't block app if RPC temporarily fails
}
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};