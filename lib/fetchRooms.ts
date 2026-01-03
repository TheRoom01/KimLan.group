import { supabase } from "./supabase";

export type UpdatedDescCursor = { id: string; updated_at: string };

export type FetchRoomsParams = {
  limit: number;

  // ✅ updated_desc: cursor object (updated_at + id)
  // ✅ price_asc/price_desc/fallback: cursor có thể là uuid string
  cursor?: string | UpdatedDescCursor | null;

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
  for (const k of keys) out[k as any] = obj[k as any];
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
  "gallery_urls",
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
  "gallery_urls",
  "has_video",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
] as const;

export async function fetchRooms(
  params: FetchRoomsParams
): Promise<{ data: any[]; nextCursor: string | UpdatedDescCursor | null }> {
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

  // ✅ Parse cursor theo đúng SQL:
  // - updated_desc dùng {updated_at, id}
  // - price_asc/price_desc/fallback dùng uuid string
  const cursorObj: UpdatedDescCursor | null =
    cursor && typeof cursor === "object"
      ? { id: String((cursor as any).id), updated_at: String((cursor as any).updated_at) }
      : null;

  const cursorId: string | null =
    cursorObj?.id ?? (typeof cursor === "string" ? cursor.trim() || null : null);

  const cursorUpdatedAt: string | null = cursorObj?.updated_at ?? null;

  // (debug) nếu không cần nữa thì xoá log này để nhẹ
  console.log("RPC payload", {
    p_limit: limit,
    p_cursor: cursorId,
    p_cursor_id: cursorId,
    p_cursor_updated_at: cursorUpdatedAt,
    p_search: search ?? null,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_districts: districts?.length ? districts : null,
    p_room_types: effectiveRoomTypes.length ? effectiveRoomTypes : null,
    p_move: move ?? null,
    p_sort: sortMode ?? "updated_desc",
  });

  const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
    p_role: role,
    p_limit: limit,

    // ✅ quan trọng: updated_desc keyset cursor cần 2 khóa
    p_cursor: cursorId, // giữ tương thích cho price_asc/desc + fallback
    p_cursor_id: cursorId,
    p_cursor_updated_at: cursorUpdatedAt,

    p_search: search ?? null,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_districts: districts?.length ? districts : null,
    p_room_types: effectiveRoomTypes.length ? effectiveRoomTypes : null,
    p_move: move ?? null,
    p_sort: sortMode ?? "updated_desc",
  });

  if (error) {
    console.error(error);
    return { data: [], nextCursor: null };
  }

  // RPC return: { data: jsonb[], nextCursor: jsonb | uuid | null }
  const rows = ((data as any)?.data ?? []) as any[];

  // ✅ Giảm work/memory ở FE bằng cách chỉ giữ field cần render list
  const projected =
    role === 1
      ? rows.map((r) => pick(r, ADMIN_L1_KEYS))
      : role === 2
        ? rows.map((r) => pick(r, ADMIN_L2_KEYS))
        : rows.map((r) => pick(r, PUBLIC_KEYS));

  // ✅ nextCursor phải lấy đúng từ RPC:
  // - updated_desc => object {updated_at,id}
  // - price_* / fallback => uuid string | null
  const rawNext = (data as any)?.nextCursor ?? null;

  const nextCursor: string | UpdatedDescCursor | null =
    rawNext && typeof rawNext === "object"
      ? { id: String(rawNext.id), updated_at: String(rawNext.updated_at) }
      : typeof rawNext === "string"
        ? rawNext
        : null;

  return { data: projected, nextCursor };
}
