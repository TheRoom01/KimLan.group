import { type RoomFeature } from "@/lib/rooms/features";
import { roomListFilterRpcParams, type SortMode } from "@/lib/rooms/listFilters";
import { attachRoomBadges, type RoomBadge } from "@/lib/roomBadges";
import { supabase } from "./supabase";

export type UpdatedDescCursor = {
  id: string;
  updated_at: string;
  created_at: string;
  search_score?: number;
};


export type FetchRoomsParams = {
  limit: number;

  // ✅ updated_desc: cursor object (updated_at + id)
  // ✅ price_asc/price_desc/fallback: cursor có thể là uuid string
  cursor?: string | UpdatedDescCursor | null;

  adminLevel?: 0 | 1 | 2;
  vipAccessTokenHash?: string | null;

  search?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  districts?: string[];
  roomType?: string;
  roomTypes?: string[];
  move?: "elevator" | "stairs" | null;
  petPolicies?: ("cat" | "dog" | "nopet")[];
  contractTerms?: ("short" | "long")[];
  sortMode?: SortMode;
  status?: string | null;
  currentUserId?: string | null;
  anonSessionId?: string | null;
  badge?: RoomBadge | null;
  featureFilters?: RoomFeature[];
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

export async function fetchRooms(
  params: FetchRoomsParams
): Promise<{
  data: any[];
  nextCursor: string | UpdatedDescCursor | null;
  total?: number;
}> {
    const {
    limit, cursor, adminLevel, currentUserId,
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

// ✅ CỰC KỲ QUAN TRỌNG:
// Không dùng new Date(string).toISOString() cho cursor timestamp từ Postgres,
// vì JavaScript sẽ làm mất microseconds:
// "2026-06-07T17:47:30.366639+00:00"
// -> "2026-06-07T17:47:30.366Z"
// Làm keyset pagination bị nhảy sai / mất dữ liệu.
const toTimestampOrNull = (v: unknown): string | null => {
  if (!v) return null;

  if (v instanceof Date) {
    return v.toISOString();
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // Giữ nguyên string từ Supabase/Postgres để không mất microseconds.
    return s;
  }

  return null;
};

const cursorUpdatedAt: string | null = toTimestampOrNull(cursorObj?.updated_at);
const cursorCreatedAt: string | null = toTimestampOrNull((cursorObj as any)?.created_at);

const anonSessionId = params.anonSessionId ?? null;
if (params.vipAccessTokenHash) {
  console.log(
    "[VIP RPC HASH PRESENT]",
    params.vipAccessTokenHash.slice(0, 12)
  );
} else {
  console.log("[VIP RPC HASH EMPTY]");
}

const { data, error } = await supabase.rpc("fetch_rooms_cursor_full_v1", {
  // 1) bắt buộc
  p_role: role,
  p_limit: Number(limit) || 20,

  // 2) cursor (uuid) — dùng cho sort giá + fallback
  p_cursor: cursorId ? String(cursorId) : null,
  p_vip_token_hash:
  params.vipAccessTokenHash ?? null,

  ...roomListFilterRpcParams(params),
  p_cursor_updated_at: cursorUpdatedAt ? cursorUpdatedAt : null,
    p_cursor_created_at: cursorCreatedAt ? cursorCreatedAt : null,
    p_cursor_id: cursorId ? String(cursorId) : null, 
    p_anon_session_id: anonSessionId,

  });

  if (error) {
    console.error(error);
    throw new Error(error.message || "Không thể tải danh sách phòng");
  }

  // RPC return: { data: jsonb[], nextCursor: jsonb | uuid | null, total_count?: number }
  const rows = ((data as any)?.data ?? []) as any[];

  // ✅ Quyền xem link_zalo / zalo_phone:
// - Admin L1: xem tất cả
// - Admin L2: chỉ xem phòng của chính mình
// - Public/Anon: không xem
  const projected = rows.map((row) => {
  const rowOwnerId = String((row as any)?.owner_id ?? "").trim();
  const userId = String(currentUserId ?? "").trim();

  const canSeePrivateFields =
    role === 1 ||
    (
      role === 2 &&
      Boolean(userId) &&
      rowOwnerId === userId
    );

  if (canSeePrivateFields) {
    return row;
  }

  return {
    ...row,
    link_zalo: null,
    zalo_phone: null,
  };
});
const roomsWithBadges = await attachRoomBadges(supabase, projected);

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
          search_score:
            Number.isFinite(Number((rawNext as any).search_score))
              ? Number((rawNext as any).search_score)
              : undefined,
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

  return { data: roomsWithBadges, nextCursor, total };
}
