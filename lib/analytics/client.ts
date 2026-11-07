"use client";

type VisitorAction = "keyword_search" | "filter_use" | "room_view";
let fallbackVisitor: string | undefined;
const recent = new Map<VisitorAction, { details: string; time: number }>();

export function trackVisitorEvent(action: VisitorAction, roomId?: string, details?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    if (action !== "room_view") {
      const signature = JSON.stringify(details ?? {});
      if (action === "filter_use" && signature === "{}") return;
      const previous = recent.get(action);
      if (previous?.details === signature && now - previous.time < 1500) return;
      recent.set(action, { details: signature, time: now });
    }
    let visitorId = fallbackVisitor ??= crypto.randomUUID();
    try {
      visitorId = localStorage.getItem("report_visitor_v1") || visitorId;
      localStorage.setItem("report_visitor_v1", visitorId);
    } catch { /* Storage-disabled browsers keep a document-scoped identity. */ }
    return fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), visitorId, action, roomId, details }),
      keepalive: true,
    }).then(response => response.ok).catch(() => false);
  } catch { /* Analytics must never interrupt navigation. */ }
}
