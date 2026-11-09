import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pushConfig, pushSubscription, sendToDevice } from "@/lib/notifications/webPush";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = new URL(request.url);
  if (request.headers.get("origin") !== origin.origin ||
      Number(request.headers.get("content-length")) > 8192) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const viewer = await createSupabaseServerClient();
  const { data: { user } } = await viewer.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data } = await viewer.auth.getClaims();
  const session = data?.claims.session_id;
  if (typeof session !== "string" || data?.claims.sub !== user.id) return NextResponse.json({ ok: false }, { status: 401 });

  const config = pushConfig();
  const testEnabled = process.env.VERCEL_ENV !== "production" &&
    !!process.env.WEB_PUSH_TEST_ORIGIN && process.env.WEB_PUSH_TEST_ORIGIN === origin.origin;
  const body = await request.json().catch(() => null);
  if (body?.accountId !== user.id) return NextResponse.json({ ok: false }, { status: 403 });
  if (body.action === "config") {
    return NextResponse.json({ publicKey: config?.publicKey ?? null, testEnabled: !!config && testEnabled, accountId: user.id });
  }
  const subscription = pushSubscription(body?.subscription);
  if (!subscription) return NextResponse.json({ ok: false }, { status: 400 });
  const store = createSupabaseAdminClient();

  if (body.action === "disable") {
    const { error } = await store.from("web_push_subscriptions").delete()
      .eq("endpoint", subscription.endpoint).eq("user_id", user.id).eq("app_origin", origin.origin);
    return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 });
  }
  if (!config) return NextResponse.json({ ok: false }, { status: 503 });
  const { data: active, error: deviceError } = await store.from("device_sessions")
    .select("id").eq("user_id", user.id).eq("auth_session_id", session).is("revoked_at", null).maybeSingle();
  if (!active) return NextResponse.json({ ok: false }, { status: deviceError ? 503 : 403 });

  if (body.action === "sync") {
    const { error } = await store.rpc("sync_web_push_subscription", {
      p_endpoint: subscription.endpoint, p_user_id: user.id, p_session_id: session,
      p_app_origin: origin.origin, p_vapid_key: config.publicKey,
      p_p256dh: subscription.p256dh, p_auth_secret: subscription.auth_secret,
    });
    if (error) console.warn("Web Push subscription sync failed", { code: error.code });
    return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 });
  }

  if (body.action !== "test" || !testEnabled) return NextResponse.json({ ok: false }, { status: 403 });
  const { data: target, error } = await store.from("web_push_subscriptions")
    .update({ last_test_at: new Date().toISOString() })
    .eq("endpoint", subscription.endpoint).eq("p256dh", subscription.p256dh).eq("auth_secret", subscription.auth_secret)
    .eq("user_id", user.id).eq("session_id", session).eq("app_origin", origin.origin).eq("vapid_key", config.publicKey)
    .or(`last_test_at.is.null,last_test_at.lt.${new Date(Date.now() - 60_000).toISOString()}`)
    .select("endpoint,p256dh,auth_secret,session_id").maybeSingle();
  if (error || !target) return NextResponse.json({ ok: false }, { status: error ? 503 : 429 });
  const ok = await sendToDevice(store, target, {
    title: "Thông báo thử từ The Room", body: "Thiết bị này đã nhận được Web Push.", url: "/",
  }, config);
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}
