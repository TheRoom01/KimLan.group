"use client";

export type VisitorAction = "page_view" | "filter_use" | "room_view" | "admin_click";
let fallbackVisitor: string | undefined;
const recent = new Map<string, number>();

export function trackVisitorEvent(action: VisitorAction, roomId?: string, eventId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = `${action}:${roomId ?? ""}`;
    const now = Date.now();
    // View lifecycles supply their own id; never throttle legitimate rapid views.
    // The database deduplicates a repeated request with the same event id.
    if (!eventId) {
      if (now - (recent.get(key) ?? 0) < 1500) return;
      recent.set(key, now);
    }
    let visitorId = fallbackVisitor ??= crypto.randomUUID();
    try {
      visitorId = localStorage.getItem("report_visitor_v1") || visitorId;
      localStorage.setItem("report_visitor_v1", visitorId);
    } catch { /* Storage-disabled browsers keep a document-scoped identity. */ }
    return fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId ?? crypto.randomUUID(), visitorId, action, roomId }),
      keepalive: true,
    }).then(response => response.ok).catch(() => false);
  } catch { /* Analytics must never interrupt navigation. */ }
}

const HOME_VIEW_KEY = "report_home_view_at_v1";
const HOME_VIEW_INTERVAL = 30 * 60 * 1000;
let lastHomeView = 0;
let homeViewPending = false;

export async function trackHomePageView() {
  if (typeof window === "undefined") return;
  const record = async () => {
    if (homeViewPending) return;
    const now = Date.now();
    let previous = lastHomeView;
    try {
      const stored = Number(localStorage.getItem(HOME_VIEW_KEY));
      if (Number.isFinite(stored) && stored > 0) previous = Math.max(previous, stored);
    } catch { /* Use in-memory protection when browser storage is unavailable. */ }
    if (previous > 0 && now - previous < HOME_VIEW_INTERVAL) return;
    homeViewPending = true;
    try {
      const accepted = await trackVisitorEvent("page_view", undefined, crypto.randomUUID());
      if (accepted) {
        lastHomeView = now;
        try { localStorage.setItem(HOME_VIEW_KEY, String(now)); } catch { /* Memory fallback. */ }
      }
    } catch { /* Analytics must not interrupt Home. */ }
    finally { homeViewPending = false; }
  };
  // Serialize tabs on the same origin so simultaneous Home opens count once.
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(HOME_VIEW_KEY, record);
    } else {
      await record();
    }
  } catch { /* Browser shutdown or unavailable locks must not affect navigation. */ }
}
