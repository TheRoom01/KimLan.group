import { supabase } from "./supabase";

export type FetchRoomsParams = {
  limit: number;
  cursor?: string; // uuid (cursor pagination)

  adminLevel?: 0 | 1 | 2;

  search?: string;
  minPrice?: number;
  maxPrice?: number;
  districts?: string[];
  roomType?: string;
  roomTypes?: string[];
  move?: "elevator" | "stairs";
  sortMode?: "updated_desc" | "price_asc" | "price_desc";
};

/**
 * NOTE (perf):
 * - Muốn giảm payload *trên network* thì phải giảm cột ở phía DB/RPC (ví dụ: RPC chỉ SELECT các cột cần cho list).
 * - File này chỉ có thể "project" (lọc bớt field) sau khi nhận về để giảm memory/JS work khi render 15k phòng.
 */
const pick = <T extends Record<string, any>, K extends readonly (keyof T)[]>(
  obj: T,
  keys: K
): Pick<T, K[number]> => {
  const out: any = {};
  for (const k of keys) out[k] = obj[k as any];
  return out;
};

// ✅ Các field cần cho UI list (tuỳ role)
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
  "gallery_urls",
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
  "gallery_urls",
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
  "gallery_urls",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
] as const;

export async function fetchRooms(params: FetchRoomsParams) {
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
    sortMode,
  } = params;

  const effectiveRoomTypes =
    roomTypes?.length ? roomTypes : roomType?.trim() ? [roomType.trim()] : [];

  const role = adminLevel === 2 ? 2 : adminLevel === 1 ? 1 : 0;

  const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
    p_role: role,
    p_limit: limit,
    p_cursor: cursor ?? null,
    p_search: search ?? null,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_districts: districts?.length ? districts : null,
    p_room_types: effectiveRoomTypes.length ? effectiveRoomTypes : null,
    // moveFilter hiện là string UI ("elevator" | "stairs") => map sang boolean như RPC bạn tạo
    p_move: move ?? null, // "elevator" | "stairs" | null
    p_sort: sortMode ?? "updated_desc",
  });

 if (error) {
  console.error(error);
  return { data: [], nextCursor: null as string | null };
}

  const rows = (data?.data ?? []) as any[];

  // ✅ Giảm work/memory ở FE bằng cách chỉ giữ field cần render list
  const projected =
  role === 1
    ? rows.map((r) => pick(r, ADMIN_L1_KEYS))
    : role === 2
    ? rows.map((r) => pick(r, ADMIN_L2_KEYS))
    : rows.map((r) => pick(r, PUBLIC_KEYS));

  return {
    data: projected,
    nextCursor: (data?.nextCursor ?? null) as string | null,
  };
}