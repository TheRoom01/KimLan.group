import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ANONYMOUS_HOME_COOKIE,
  ANONYMOUS_HOME_COOKIE_MAX_AGE,
  createAnonymousHomeSessionToken,
  verifyAnonymousHomeSessionToken,
} from "@/lib/anonymousHomeSessionToken";

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
function parseValidRpcResult(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) {
    const first = v[0];
    return Boolean(first && typeof first === "object" && "valid" in first && first.valid);
  }
  if (v && typeof v === "object" && "valid" in v) return Boolean(v.valid);
  return false;
}
function parseRegisterStatus(v: unknown): string {
  if (Array.isArray(v)) {
    const first = v[0];
    return first && typeof first === "object" && "status" in first
      ? String(first.status || "")
      : "";
  }
  if (v && typeof v === "object" && "status" in v) return String(v.status || "");
  return "";
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const needsRoomSession = pathname === "/" || pathname === "/map" || pathname.startsWith("/rooms/");
  let anonymousCookieToSet: string | null = null;
  const existingAnonymousToken = needsRoomSession
    ? await verifyAnonymousHomeSessionToken(request.cookies.get(ANONYMOUS_HOME_COOKIE)?.value).catch(() => null)
    : null;
  if (needsRoomSession && !existingAnonymousToken) {
    try {
      anonymousCookieToSet = await createAnonymousHomeSessionToken();
      request.cookies.set(ANONYMOUS_HOME_COOKIE, anonymousCookieToSet);
    } catch {
      anonymousCookieToSet = null;
    }
  }

  // Create an initial response
  let response = NextResponse.next({ request });
  const applyAnonymousCookie = (target: NextResponse) => {
    if (anonymousCookieToSet) {
      target.cookies.set(ANONYMOUS_HOME_COOKIE, anonymousCookieToSet, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ANONYMOUS_HOME_COOKIE_MAX_AGE,
      });
    }
    return target;
  };
  applyAnonymousCookie(response);

  // ✅ Guard ENV: thiếu thì fail-open (không crash middleware/proxy)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const authIndependentPublicPath =
    pathname === "/sw.js" ||
    pathname === "/map" ||
    pathname === "/sales" ||
    pathname.startsWith("/sales/") ||
    pathname.startsWith("/auth/");
  if (authIndependentPublicPath) return response;

  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  const hasBearerToken = request.headers.get("authorization")?.startsWith("Bearer ");

  // Không có session thì không gọi Supabase Auth/Device trên mọi navigation public.
  if (!hasAuthCookie && !hasBearerToken) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        applyAnonymousCookie(response);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
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

  if (!userId) return response;

  const deviceId = request.cookies.get(DEVICE_ID_COOKIE)?.value || randomToken(12);
  const oldToken = request.cookies.get(DEVICE_COOKIE)?.value;
  let deviceToken = oldToken || randomToken(32);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  const redirectWithCookies = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  try {
    const { data: valid, error } = await supabase.rpc("validate_device_session", {
      p_token_hash: await sha256Base64Url(deviceToken),
    });
    if (error || parseValidRpcResult(valid)) return response;

    const fingerprint = await sha256Base64Url([
      request.headers.get("user-agent") || "",
      request.headers.get("sec-ch-ua-platform") || "",
      request.headers.get("sec-ch-ua") || "",
    ].join("|"));
    const register = async () => supabase.rpc("register_device_session", {
      p_device_id: deviceId,
      p_token_hash: await sha256Base64Url(deviceToken),
      p_device_fingerprint: fingerprint,
      p_max_devices: 2,
      p_evict_oldest: false,
      p_device_name: null,
    });
    let registration = await register();
    if (registration.error?.code === "23505") {
      deviceToken = randomToken(32);
      registration = await register();
    }
    if (registration.error) return response;

    const status = parseRegisterStatus(registration.data);
    if (status === "revoked" || status === "replaced") {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      const target = new URL(pathname === "/owner" || pathname.startsWith("/owner/") ? "/owner" : "/", request.url);
      target.searchParams.set("auth", status === "replaced" ? "kicked" : "signed-out");
      const redirect = redirectWithCookies(target);
      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith("sb-") && name.includes("-auth-token")) {
          redirect.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
        }
      }
      redirect.cookies.set(DEVICE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      redirect.cookies.set(DEVICE_ID_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return redirect;
    }

    if (status === "ok" || status === "limit_reached") {
      if (deviceToken !== oldToken) response.cookies.set(DEVICE_COOKIE, deviceToken, cookieOptions);
      if (!request.cookies.has(DEVICE_ID_COOKIE)) response.cookies.set(DEVICE_ID_COOKIE, deviceId, cookieOptions);
    }

    if (status === "limit_reached") {
      const target = new URL("/auth/device-limit", request.url);
      target.searchParams.set("next", pathname + request.nextUrl.search);
      return redirectWithCookies(target);
    }
  } catch {
    // Keep the current session usable during a temporary service failure.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
