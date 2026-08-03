export function extractRoomActionUrls(value: unknown) {
  return Array.from(
    new Set(String(value ?? "").match(/https?:\/\/[^\s,;]+/gi) ?? []),
  );
}

export function firstRoomActionUrl(value: unknown) {
  return extractRoomActionUrls(value)[0] ?? "";
}

export function normalizeGoogleMapsUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : raw ? `https://${raw}` : "";
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "google.com" ||
      host.endsWith(".google.com")
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function buildGoogleMapsSearchUrl(address: unknown) {
  const query = String(address ?? "").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}
