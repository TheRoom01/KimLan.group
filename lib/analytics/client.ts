"use client";

export type VisitorAction = "page_view" | "filter_use" | "room_view" | "admin_click";
let fallbackVisitor: string | undefined;
const recent = new Map<string, number>();

export function trackVisitorEvent(action: VisitorAction, roomId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = `${action}:${roomId ?? ""}`;
    const now = Date.now();
    // Suppress React StrictMode/remount duplicates, not later visits.
    if (now - (recent.get(key) ?? 0) < 1500) return;
    recent.set(key, now);
    let visitorId = fallbackVisitor ??= crypto.randomUUID();
    try {
      visitorId = localStorage.getItem("report_visitor_v1") || visitorId;
      localStorage.setItem("report_visitor_v1", visitorId);
    } catch { /* Storage-disabled browsers keep a document-scoped identity. */ }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), visitorId, action, roomId }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* Analytics must never interrupt navigation. */ }
}
