import { type RoomFeature } from "@/lib/rooms/features";
import { roomListFilterRpcParams, type SortMode } from "@/lib/rooms/listFilters";
import { attachRoomBadges, type RoomBadge } from "@/lib/roomBadges";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdatedDescCursor = {
  id: string;
  updated_at: string;
  created_at: string;
  search_score?: number;
};

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
  petPolicies?: ("cat" | "dog" | "nopet")[] | null;
  contractTerms?: ("short" | "long")[] | null;

  // ✅ NEW: lọc 1 status (null | "Trống" | "Đã thuê")
  status?: string | null;
  badge?: RoomBadge | null;
  featureFilters?: RoomFeature[];

  // (server) vẫn có thể truyền sortMode nếu bạn muốn đồng bộ với client
  sortMode?: SortMode | null;
  anonSessionId?: string | null;
  vipAccessTokenHash?: string | null;
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
  "available_from",
  "image_urls",
  "image_count",
  "has_video",
  "badges",
  "video_url",
  "thumb_url",
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
  "available_from",
  "image_urls",
  "image_count",
  "has_video",
  "badges",
  "video_url",
  "thumb_url",
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
  "available_from",
  "image_urls",
  "image_count",
  "has_video",
  "badges",
  "video_url",
  "thumb_url",
  "created_at",
  "updated_at",
  "description",
  "chinh_sach",
  "room_detail",
  "link_zalo",
  "zalo_phone",
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
  error?: string;
}> {
  const {
    limit, cursor, adminLevel, anonSessionId, vipAccessTokenHash,
  } = params;
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
        search_score:
          Number.isFinite(Number((cursor as any).search_score))
            ? Number((cursor as any).search_score)
            : undefined,
      }
    : null;


  const cursorId: string | null =
    cursorObj?.id ?? (typeof cursor === "string" ? cursor.trim() || null : null);

 const toTimestampOrNull = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();

  if (typeof v === "string") {
    const s = v.trim();
    return s || null;
  }

  return null;
};

const cursorUpdatedAt: string | null = toTimestampOrNull(cursorObj?.updated_at);
const cursorCreatedAt: string | null = toTimestampOrNull((cursorObj as any)?.created_at);

const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
  // 1) bắt buộc
  p_role: role,
  p_limit: Number(limit) || 20,

  // 2) cursor (uuid) — dùng cho sort giá + fallback
  p_cursor: cursorId ? String(cursorId) : null,

  ...roomListFilterRpcParams(params),
  p_cursor_updated_at: cursorUpdatedAt ? cursorUpdatedAt : null,
p_cursor_created_at: cursorCreatedAt ? cursorCreatedAt : null,
p_cursor_id: cursorId ? String(cursorId) : null,
p_anon_session_id: anonSessionId ?? null,
p_vip_token_hash: vipAccessTokenHash ?? null,

});

  if (error) {
    console.error(error);
    return {
      data: [],
      nextCursor: null,
      total: undefined,
      error: error.message || "Không thể tải danh sách phòng",
    };
  }

  // RPC return: { data: jsonb[], nextCursor: jsonb | uuid | null, total_count?: number }
  const rows = ((data as any)?.data ?? []) as any[];

  // ✅ Cách A: DB/RPC đã tự tính quyền theo auth.uid() rồi,
// nên không dựa vào adminLevel (tránh bug vừa login vẫn anon)
const projected = await attachRoomBadges(supabase, rows);
 const rawNext = (data as any)?.nextCursor ?? null;

 const nextCursor: string | UpdatedDescCursor | null =
  rawNext && typeof rawNext === "object"
    ? {
        id: String((rawNext as any).id),
        updated_at: String((rawNext as any).updated_at),
        created_at: String((rawNext as any).created_at),
        search_score:
          Number.isFinite(Number((rawNext as any).search_score))
            ? Number((rawNext as any).search_score)
            : undefined,
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
