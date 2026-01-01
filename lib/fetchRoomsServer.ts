import type { SupabaseClient } from "@supabase/supabase-js";

export type FetchRoomsParams = {
  limit: number;
  cursor?: string | null; // uuid | null (cursor pagination)

  adminLevel?: 0 | 1 | 2;

  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  districts?: string[] | null;
  roomType?: string | null;
  roomTypes?: string[] | null;
  move?: "elevator" | "stairs" | null;
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

/**
 * Server-side fetch for initial render (SSR).
 * Uses the same RPC as the client fetch to keep logic consistent.
 */
export async function fetchRoomsServer(
  supabase: SupabaseClient,
  params: FetchRoomsParams
): Promise<{ data: any[]; nextCursor: string | null }> {
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
  } = params;

  const effectiveRoomTypes =
    roomTypes?.length ? roomTypes : roomType?.trim() ? [roomType.trim()] : [];

  const role = adminLevel === 2 ? 2 : adminLevel === 1 ? 1 : 0;

  const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
    p_role: role,
    p_limit: limit,
    p_cursor: cursor ?? null, // ✅ uuid | null
    p_search: search ?? null,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_districts: districts?.length ? districts : null,
    p_room_types: effectiveRoomTypes.length ? effectiveRoomTypes : null,
    p_move: move ?? null,
    p_sort: "updated_desc",
  });

  if (error) {
    console.error(error);
    return { data: [], nextCursor: null };
  }

  const rows = (data?.data ?? []) as any[];

  const projected =
    role === 1
      ? rows.map((r) => pick(r, ADMIN_L1_KEYS))
      : role === 2
        ? rows.map((r) => pick(r, ADMIN_L2_KEYS))
        : rows.map((r) => pick(r, PUBLIC_KEYS));

  // ✅ nextCursor luôn là uuid string | null
  const nextCursor =
    projected.length > 0 ? (projected[projected.length - 1].id as string) : null;

  return { data: projected, nextCursor };
}
