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

export function buildGoogleMapsCoordinateUrl(
  latitude: unknown,
  longitude: unknown,
) {
  const latitudeText = String(latitude ?? "").trim();
  const longitudeText = String(longitude ?? "").trim();
  if (!latitudeText || !longitudeText) return "";

  const lat = Number(latitudeText);
  const lng = Number(longitudeText);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function resolveGoogleMapsUrl({
  latitude,
  longitude,
  googleMapsUrl,
  address,
}: {
  latitude?: unknown;
  longitude?: unknown;
  googleMapsUrl?: unknown;
  address?: unknown;
}) {
  return (
    buildGoogleMapsCoordinateUrl(latitude, longitude) ||
    normalizeGoogleMapsUrl(googleMapsUrl) ||
    buildGoogleMapsSearchUrl(address)
  );
}
