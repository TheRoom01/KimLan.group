import { createECDH } from "node:crypto";
import webPush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (key.getPublicKey().toString("base64url") !== publicKey) return null;
    webPush.generateRequestDetails(
      { endpoint: "https://fcm.googleapis.com", keys: { auth: "", p256dh: "" } },
      null,
      { vapidDetails: { subject, publicKey, privateKey } },
    );
    return { subject, publicKey, privateKey };
  } catch {
    return null;
  }
}

export function pushSubscription(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (typeof endpoint !== "string" || endpoint.length > 2048 ||
      typeof keys?.p256dh !== "string" || !/^[\w-]{87}$/.test(keys.p256dh) ||
      typeof keys.auth !== "string" || !/^[\w-]{22}$/.test(keys.auth) ||
      Buffer.from(keys.p256dh, "base64url")[0] !== 4) return null;
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash ||
        !(host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
          host === "web.push.apple.com" || host.endsWith(".push.apple.com") ||
          host.endsWith(".notify.windows.com"))) return null;
    if (url.href.length > 2048) return null;
    return { endpoint: url.href, p256dh: keys.p256dh, auth_secret: keys.auth };
  } catch {
    return null;
  }
}

type Target = {
  endpoint: string; p256dh: string; auth_secret: string; session_id: string;
};
type Payload = { title: string; body: string; url: string; tag?: string };
type Store = ReturnType<typeof createSupabaseAdminClient>;

export async function sendToDevice(store: Store, target: Target, payload: Payload, vapid: NonNullable<ReturnType<typeof pushConfig>>) {
  const keys = { p256dh: target.p256dh, auth: target.auth_secret };
  if (!pushSubscription({ endpoint: target.endpoint, keys })) return false;
  try {
    await webPush.sendNotification({ endpoint: target.endpoint, keys }, JSON.stringify(payload), {
      vapidDetails: vapid, TTL: 300, timeout: 5000,
    });
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      const { error: cleanupError } = await store.from("web_push_subscriptions").delete()
        .eq("endpoint", target.endpoint).eq("session_id", target.session_id)
        .eq("p256dh", target.p256dh).eq("auth_secret", target.auth_secret);
      if (cleanupError) console.warn("Web Push subscription cleanup failed", { code: cleanupError.code });
    } else {
      console.warn("Web Push delivery failed", { status });
    }
    return false;
  }
}

export async function sendEventPush(origin: string, event:
  | { type: "room_consult_request"; id: string; kind: "room_consultation" | "general_consultation" }
  | { type: "property_access_granted"; id: string; userId: string }) {
  const config = pushConfig();
  if (!config) return;
  try {
    const store = createSupabaseAdminClient();
    const consult = event.type === "room_consult_request";
    const recipients = consult
      ? await store.from("notifications").select("user_id").eq("type", event.type)
          .eq("reference_type", "room_consult_request").eq("reference_id", event.id)
      : { data: [{ user_id: event.userId }], error: null };
    if (recipients.error) throw recipients.error;
    const ids = [...new Set((recipients.data ?? []).map(row => row.user_id))];
    if (!ids.length) return;

    const { data, error } = await store.from("web_push_active_subscriptions")
      .select("endpoint,p256dh,auth_secret,session_id,user_id").in("user_id", ids)
      .eq("app_origin", origin).eq("vapid_key", config.publicKey);
    if (error) throw error;
    if (!data?.length) return;
    const adminIds = new Set<string>();
    if (consult) {
      const { data: admins, error: adminError } = await store.from("admin_users")
        .select("user_id").in("user_id", [...new Set(data.map(target => target.user_id))]).in("level", [1, 2]);
      if (adminError) throw adminError;
      for (const admin of admins ?? []) adminIds.add(admin.user_id);
    }
    const reference = encodeURIComponent(event.id);
    await Promise.all(data.map(target => {
      const payload = consult
        ? { title: event.kind === "general_consultation" ? "Yêu cầu tư vấn chung mới" : "Yêu cầu tư vấn phòng mới",
            body: "Mở The Room để xem yêu cầu của khách hàng.",
            url: `/${adminIds.has(target.user_id) ? "admin" : "owner"}/room-inquiries?request=${reference}`, tag: `consult:${event.id}` }
        : { title: "Quyền quản lý tòa nhà đã thay đổi", body: "Mở The Room để xem quyền truy cập của bạn.",
            url: `/owner/properties/${reference}`, tag: `access:${event.id}` };
      return sendToDevice(store, target, payload, config);
    }));
  } catch {
    console.warn("Web Push event dispatch failed", { type: event.type });
  }
}
