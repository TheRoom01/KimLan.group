import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const originLatitude = Number(requestUrl.searchParams.get("lat"));
  const originLongitude = Number(requestUrl.searchParams.get("lng"));
  const hasOrigin = Number.isFinite(originLatitude) && Number.isFinite(originLongitude)
    && originLatitude >= -90 && originLatitude <= 90
    && originLongitude >= -180 && originLongitude <= 180;
  if (query.length < 3 || query.length > 120) return NextResponse.json({ results: [] });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${query}, Việt Nam`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "15");
    url.searchParams.set("countrycodes", "vn");
    url.searchParams.set("accept-language", "vi");
    if (hasOrigin) {
      url.searchParams.set("viewbox", [originLongitude - 0.45, originLatitude + 0.35, originLongitude + 0.45, originLatitude - 0.35].join(","));
      url.searchParams.set("bounded", "0");
    }
    const response = await fetch(url, {
      headers: { "User-Agent": "KimLanGroup-MapSearch/1.0 (https://canhodichvu.pro)", Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const rows = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string; category?: string; type?: string }>;
    const results = rows.map((row) => ({
      id: String(row.place_id),
      label: row.display_name,
      latitude: Number(row.lat),
      longitude: Number(row.lon),
      category: row.category,
      type: row.type,
    })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
    if (hasOrigin) {
      results.sort((left, right) => {
        const leftDistance = (left.latitude - originLatitude) ** 2 + ((left.longitude - originLongitude) * Math.cos((originLatitude * Math.PI) / 180)) ** 2;
        const rightDistance = (right.latitude - originLatitude) ** 2 + ((right.longitude - originLongitude) * Math.cos((originLatitude * Math.PI) / 180)) ** 2;
        return leftDistance - rightDistance;
      });
    }
    return NextResponse.json({ results: results.slice(0, 12) });
  } catch {
    return NextResponse.json({ results: [], error: "Tìm địa điểm đang tạm gián đoạn" }, { status: 503 });
  }
}
