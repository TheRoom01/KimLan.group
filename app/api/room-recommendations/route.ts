import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recommendationRoomsForViewer } from "@/lib/rooms/recommendationAccess";
import type { RecommendedRoom } from "@/lib/rooms/recommendations";
import { hasRecommendationFilters, parseRecommendationRequest, recommendationRpcParams, ROOM_RECOMMENDATIONS_ENABLED } from "@/lib/rooms/recommendations";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!ROOM_RECOMMENDATIONS_ENABLED) return NextResponse.json({ data: [] }, { headers });
  let parsed;
  try {
    // Keep the body bounded even if Content-Length is absent or untrusted.
    const body = await request.text();
    if (body.length > 12_000) return NextResponse.json({ error: "Bộ lọc quá dài" }, { status: 413, headers });
    parsed = parseRecommendationRequest(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Bộ lọc không hợp lệ" }, { status: 400, headers });
  }
  if (!hasRecommendationFilters(parsed.filters)) return NextResponse.json({ data: [] }, { headers });
  try {
    // Service-role-only INVOKER RPC returns an explicit public projection.
    // No service key, caller-supplied role or private room record reaches the browser.
    const server = createSupabaseAdminClient();
    const viewer = await createSupabaseServerClient();
    // Derive list search semantics from the signed session, never request data.
    const { data: { user }, error: authError } = await viewer.auth.getUser();
    let viewerIsAdmin = false;
    if (!authError && user) {
      const { data: level, error: levelError } = await viewer.rpc("get_my_admin_level");
      if (levelError) throw new Error("Cannot verify recommendation viewer");
      viewerIsAdmin = Number(level) === 1 || Number(level) === 2;
    }
    const { data, error } = await server
      .rpc("fetch_room_recommendations_v2", recommendationRpcParams(parsed.filters, parsed.excludeIds, viewerIsAdmin))
      .abortSignal(request.signal);
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return NextResponse.json({ data: [], unavailable: true }, { status: 503, headers });
      }
      return NextResponse.json({ error: "Chưa tải được phòng đề xuất" }, { status: 502, headers });
    }
    const rooms = Array.isArray(data) ? data as RecommendedRoom[] : [];
    const visibleRooms = rooms.length ? await recommendationRoomsForViewer(rooms, viewer, server) : rooms;
    return NextResponse.json({ data: visibleRooms }, { headers });
  } catch {
    return NextResponse.json({ error: "Chưa tải được phòng đề xuất" }, { status: 503, headers });
  }
}
