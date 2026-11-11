const PUSH_ONLY = new URL(self.location.href).searchParams.has("push-only");
const CACHE_VERSION = "kimlan-pwa-v3";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/the-room-icon-192.png",
  "/the-room-icon-512.png",
  "/the-room-maskable-512.png",
  "/the-room-apple-touch.png",
];

self.addEventListener("install", (event) => {
  if (PUSH_ONLY) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL.map((path) => cache.add(path))))
      .catch((error) => console.warn("PWA shell cache unavailable", error))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  if (PUSH_ONLY) {
    event.waitUntil(self.clients.claim());
    return;
  }
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("kimlan-pwa-") && key !== APP_SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .catch((error) => console.warn("PWA cache cleanup failed", error))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (PUSH_ONLY) return;
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  if (
    ["style", "script", "image", "font"].includes(request.destination) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) void cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});

function notificationTarget(path) {
  const fallback = new URL("/", self.location.origin);
  try {
    const url = new URL(typeof path === "string" ? path : "/", fallback);
    return url.origin === fallback.origin ? url.href : fallback.href;
  } catch {
    return fallback.href;
  }
}

self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (typeof payload?.title !== "string") return;
  const tag = typeof payload.tag === "string" ? payload.tag : "";
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/notification-logo.png?v=2",
    ...(self.Notification && "vibrate" in self.Notification.prototype
      ? { vibrate: [200, 100, 200] }
      : {}),
    ...(tag ? { tag, renotify: true } : {}),
    data: { url: notificationTarget(payload.url) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url === target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});
