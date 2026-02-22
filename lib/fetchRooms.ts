import { supabase } from "./supabase";

export type UpdatedDescCursor = { id: string; updated_at: string; created_at: string };


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
  move?: "elevator" | "stairs" | null;
  sortMode?: "updated_desc" | "price_asc" | "price_desc";
  status?: string | null;
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
  "image_urls",
  "image_count",
  "has_video",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
  "link_zalo",
   "zalo_phone",
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
  "link_zalo",
  "zalo_phone",
] as const;


const expandDistrictLegacyValues = (districts?: string[] | null) => {
  if (!districts || districts.length === 0) return null;

  const out = new Set<string>();

  for (const raw of districts) {
    const v = String(raw).trim();
    if (!v) continue;

    // luôn giữ value chuẩn: "Quận 1", "Quận 10", ...
    out.add(v);

    /**
     * Match tất cả:
     * - "Quận 1"  -> 1
     * - "Quận 10" -> 10
     * - "Quận 3"  -> 3
     * - ...
     */
    const match = v.match(/(\d+)/);
    if (match?.[1]) {
      out.add(match[1]); // số thuần cho DB legacy
    }
  }

  return out.size ? Array.from(out) : null;
};

const expandRoomTypeLegacyValues = (roomTypes?: string[] | null) => {
  if (!roomTypes || roomTypes.length === 0) return null;

  const out = new Set<string>();

  for (const raw of roomTypes) {
    const v = String(raw).trim();
    if (!v) continue;

    // giữ value chuẩn trên UI
    out.add(v);

    // Mapping legacy: "1 Phòng ngủ" -> "1PN", "2 Phòng ngủ" -> "2PN"
    if (/^1\s*Phòng ngủ$/i.test(v)) out.add("1PN");
    if (/^2\s*Phòng ngủ$/i.test(v)) out.add("2PN");

    // (optional) nếu UI có "Studio" mà DB có "STUDIO" hoặc "0PN" thì add thêm ở đây
  }

  return out.size ? Array.from(out) : null;
};


export async function fetchRooms(
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
    sortMode,
    status,
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

const toIsoOrNull = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    // nếu đã là ISO thì giữ nguyên; nếu là string thường thì cố parse
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

const cursorUpdatedAt: string | null = toIsoOrNull(cursorObj?.updated_at);
const cursorCreatedAt: string | null = toIsoOrNull((cursorObj as any)?.created_at);

// RPC expects: 'elevator' | 'stairs' | null
const pMove =
  move === "elevator" ? "elevator" :
  move === "stairs"   ? "stairs"   :
  null;

const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
  // 1) bắt buộc
  p_role: 0,
  p_limit: Number(limit) || 20,

  // 2) cursor (uuid) — dùng cho sort giá + fallback
  p_cursor: cursorId ? String(cursorId) : null,

  // 3) filter/search
  p_search: (search ?? "").trim() ? String(search).trim() : null,
  p_min_price: Number.isFinite(Number(minPrice)) ? Number(minPrice) : null,
  p_max_price: Number.isFinite(Number(maxPrice)) ? Number(maxPrice) : null,
  p_districts: expandDistrictLegacyValues(districts) ?? null,
  p_room_types: expandRoomTypeLegacyValues(roomTypes) ?? null,
  p_move: pMove,

  // 4) statuses
  p_statuses: status ? [String(status)] : null,

  // 5) sort + keyset cursor (updated_desc cần 2 khóa)
 p_sort: (sortMode ?? "updated_desc") as any,
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

  // ✅ Giảm work/memory ở FE bằng cách chỉ giữ field cần render list
  // ✅ Cách A: DB/RPC đã tự tính quyền theo auth.uid() rồi,
// nên không dựa vào adminLevel (tránh bug vừa login vẫn anon)
const projected = rows;

  // ✅ nextCursor phải lấy đúng từ RPC:
  // - updated_desc => object {updated_at,id}
  // - price_* / fallback => uuid string | null
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


  // ✅ total_count từ RPC (nếu có)
  const rawTotal = (data as any)?.total_count;
  const total =
    typeof rawTotal === "number"
      ? rawTotal
      : typeof rawTotal === "string" && rawTotal.trim() !== "" && Number.isFinite(Number(rawTotal))
      ? Number(rawTotal)
      : undefined;

  return { data: projected, nextCursor, total };
}
