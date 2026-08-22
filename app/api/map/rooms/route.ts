import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function finiteParam(params: URLSearchParams, name: string, min: number, max: number, required = true) {
  const raw = params.get(name);
  if (!raw && !required) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Tham số ${name} không hợp lệ`);
  return value;
}

function listParam(params: URLSearchParams, name: string) {
  const values = params.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  return values.length ? values.slice(0, 20) : null;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const west = finiteParam(params, "west", -180, 180)!;
    const south = finiteParam(params, "south", -90, 90)!;
    const east = finiteParam(params, "east", -180, 180)!;
    const north = finiteParam(params, "north", -90, 90)!;
    if (west >= east || south >= north) throw new Error("Khung bản đồ không hợp lệ");

    const centerLat = finiteParam(params, "lat", -90, 90, false);
    const centerLng = finiteParam(params, "lng", -180, 180, false);
    const radius = finiteParam(params, "radius", 0.1, 50, false);
    if (radius !== null && (centerLat === null || centerLng === null)) throw new Error("Tìm theo bán kính cần tọa độ tâm");

    const supabase = await createSupabaseServerClient();
    const statuses = listParam(params, "status");
    if (statuses?.some((status) => !["all", "Đang trống", "Sắp trống", "Đã thuê"].includes(status))) {
      throw new Error("Trạng thái phòng không hợp lệ");
    }
    const rpcParams = {
      p_west: west, p_south: south, p_east: east, p_north: north,
      p_search: params.get("search")?.trim().slice(0, 120) || null,
      p_min_price: finiteParam(params, "minPrice", 0, 1_000_000_000, false),
      p_max_price: finiteParam(params, "maxPrice", 0, 1_000_000_000, false),
      p_districts: listParam(params, "district"),
      p_room_types: listParam(params, "roomType"),
      p_statuses: statuses,
      p_center_lat: centerLat, p_center_lng: centerLng, p_radius_km: radius,
      p_limit: 3000,
    };

    // Supabase Data API caps one response at 1,000 rows. Request consecutive
    // ranges so a wide map viewport can still receive the RPC's full 3,000-row
    // limit without changing the public API or the client-side map architecture.
    const rooms: unknown[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < rpcParams.p_limit; offset += pageSize) {
      const { data, error } = await supabase
        .rpc("search_rooms_in_map_v1", rpcParams)
        .range(offset, offset + pageSize - 1);
      if (error) return NextResponse.json({ error: "Không thể tải phòng trong khu vực này" }, { status: 502 });
      const page = data ?? [];
      rooms.push(...page);
      if (page.length < pageSize) break;
    }

    return NextResponse.json({ rooms }, { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Yêu cầu không hợp lệ" }, { status: 400 });
  }
}
