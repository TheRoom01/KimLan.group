import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdatedDescCursor = { id: string; updated_at: string; created_at: string };


export type FetchRoomsParams = {
  limit: number;
  // ✅ updated_desc: cursor object (updated_at + id)
  // ✅ các mode khác (price_asc/desc fallback): có thể dùng string id
  cursor?: string | UpdatedDescCursor | null;

  adminLevel?: 0 | 1 | 2;

  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  districts?: string[] | null;
  roomType?: string | null;
  roomTypes?: string[] | null;
  move?: "elevator" | "stairs" | null;

  // ✅ NEW: lọc 1 status (null | "Trống" | "Đã thuê")
  status?: string | null;

  // (server) vẫn có thể truyền sortMode nếu bạn muốn đồng bộ với client
  sortMode?: "updated_desc" | "price_asc" | "price_desc" | null;
};

const pick = <T extends Record<string, any>, K extends readonly (keyof T)[]>(
  obj: T,
  keys: K
): Pick<T, K[number]> => {
  const out: any = {};
  for (const k of keys) out[k as any] = obj[k as any];
  return out;
};

const ADMIN_L1_KEYS = [
  "id",
  "room_code",
  "price",
  "room_type",
  "house_number",
  "address",
  "ward",
  "district",
  "status",
  "image_urls",
  "image_count",
  "has_video",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
  "link_zalo",
] as const;

const PUBLIC_KEYS = [
  "id",
  "room_code",
  "room_type",
  "address",
  "ward",
  "district",
  "price",
  "status",
  "image_urls",
  "image_count",
  "has_video",
  "created_at",
  "updated_at",
  "room_detail",
] as const;

const ADMIN_L2_KEYS = [
  "id",
  "room_code",
  "price",
  "room_type",
  "house_number",
  "address",
  "ward",
  "district",
  "status",
  "image_urls",
  "image_count",
  "has_video",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
] as const;


/**
 * Server-side fetch for initial render (SSR).
 * Uses the same RPC as the client fetch to keep logic consistent.
 */
export async function fetchRoomsServer(
  supabase: SupabaseClient,
  params: FetchRoomsParams
): Promise<{
  data: any[];
  nextCursor: string | UpdatedDescCursor | null;
  total?: number;
}> {
  const {
    limit,
    cursor,
    adminLevel,
    search,
    minPrice,
    maxPrice,
    districts,
    roomType,
    roomTypes,
    move,
    status, // ✅ NEW
    sortMode,
  } = params;

  const effectiveRoomTypes =
    roomTypes?.length ? roomTypes : roomType?.trim() ? [roomType.trim()] : [];

  const role = adminLevel === 2 ? 2 : adminLevel === 1 ? 1 : 0;

  // ✅ Parse cursor theo đúng SQL:
  // - updated_desc dùng {updated_at, id}
  // - price_asc/price_desc/fallback dùng uuid string
  const cursorObj: UpdatedDescCursor | null =
  cursor && typeof cursor === "object"
    ? {
        id: String((cursor as any).id),
        updated_at: String((cursor as any).updated_at),
        created_at: String((cursor as any).created_at),
      }
    : null;


  const cursorId: string | null =
    cursorObj?.id ?? (typeof cursor === "string" ? cursor.trim() || null : null);

  const cursorUpdatedAt: string | null = cursorObj?.updated_at ?? null;
  const cursorCreatedAt: string | null = (cursorObj as any)?.created_at ?? null;


const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
  // 1) bắt buộc
  p_role: Number(role) || 0,
  p_limit: Number(limit) || 20,

  // 2) cursor (uuid) — dùng cho sort giá + fallback
  p_cursor: cursorId ? String(cursorId) : null,

  // 3) filter/search
  p_search: (search ?? "").trim() ? String(search).trim() : null,
  p_min_price: Number.isFinite(Number(minPrice)) ? Number(minPrice) : null,
  p_max_price: Number.isFinite(Number(maxPrice)) ? Number(maxPrice) : null,
  p_districts: Array.isArray(districts) && districts.length ? districts : null,
  p_room_types: Array.isArray(effectiveRoomTypes) && effectiveRoomTypes.length ? effectiveRoomTypes : null,
  p_move: (move ?? "").trim() ? String(move).trim() : null,

  // 4) statuses
  p_statuses: status ? [String(status)] : null,

  // 5) sort + keyset cursor (updated_desc cần 2 khóa)
  p_sort: sortMode ?? "updated_desc",
p_cursor_updated_at: cursorUpdatedAt ? cursorUpdatedAt : null,
p_cursor_created_at: cursorCreatedAt ? cursorCreatedAt : null,
p_cursor_id: cursorId ? String(cursorId) : null,

});

  if (error) {
    console.error(error);
    return { data: [], nextCursor: null, total: undefined };
  }

  // RPC return: { data: jsonb[], nextCursor: jsonb | uuid | null, total_count?: number }
  const rows = ((data as any)?.data ?? []) as any[];

  const projected =
    role === 1
      ? rows.map((r) => pick(r, ADMIN_L1_KEYS))
      : role === 2
      ? rows.map((r) => pick(r, ADMIN_L2_KEYS))
      : rows.map((r) => pick(r, PUBLIC_KEYS));

  const rawNext = (data as any)?.nextCursor ?? null;

 const nextCursor: string | UpdatedDescCursor | null =
  rawNext && typeof rawNext === "object"
    ? {
        id: String((rawNext as any).id),
        updated_at: String((rawNext as any).updated_at),
        created_at: String((rawNext as any).created_at),
      }
    : typeof rawNext === "string"
    ? rawNext
    : null;


  const rawTotal = (data as any)?.total_count;
  const total =
    typeof rawTotal === "number"
      ? rawTotal
      : typeof rawTotal === "string" && rawTotal.trim() !== "" && Number.isFinite(Number(rawTotal))
      ? Number(rawTotal)
      : undefined;

  return { data: projected, nextCursor, total };
}
