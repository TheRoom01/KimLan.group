import type { RoomCardRoom } from "@/components/RoomCard";
import type { RoomFeature } from "./features";
import { normalizeHomeSearchKeyword } from "./search";
import { ROOM_BADGES, type RoomBadge } from "@/lib/roomBadges";

export const RECOMMENDATION_LIMIT = 10;
export const RECOMMENDATION_PRICE_EXTENSION = 2_000_000;
export const ROOM_RECOMMENDATIONS_ENABLED = process.env.NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED !== "false";

export type RecommendationFilters = {
  search: string;
  priceFilterActive: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  districts: string[];
  roomTypes: string[];
  move: "elevator" | "stairs" | null;
  petPolicies: ("cat" | "dog" | "nopet")[];
  contractTerms: ("short" | "long")[];
  features: RoomFeature[];
  status: string | null;
  badge: RoomBadge | null;
  sortMode?: string;
  center?: { latitude: number; longitude: number } | null;
};
export type RecommendedRoom = RoomCardRoom & { distance_km?: number | null };

// Deliberately independent of the main Search/FilterBar's price calculation.
export function recommendationPrices(filters: Pick<RecommendationFilters, "priceFilterActive" | "minPrice" | "maxPrice">) {
  if (!filters.priceFilterActive) return { minPrice: null, maxPrice: null };
  return {
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice === null ? null : filters.maxPrice + RECOMMENDATION_PRICE_EXTENSION,
  };
}

export function hasRecommendationFilters(f: RecommendationFilters) {
  return Boolean(normalizeHomeSearchKeyword(f.search, false) || (f.priceFilterActive && (f.minPrice !== null || f.maxPrice !== null))
    || f.districts.length || f.roomTypes.length || f.move || f.petPolicies.length
    || f.contractTerms.length || f.features.length || f.status || f.badge || f.center
    || (f.sortMode && f.sortMode !== "updated_desc"));
}

export function recommendationLabels(f: RecommendationFilters) {
  const prices = recommendationPrices(f);
  const money = (n: number) => n.toLocaleString("vi-VN");
  const labels: string[] = [];
  if (f.districts.length) labels.push(`Khu vực: ${f.districts.join(", ")}`);
  if (f.center) {
    labels.push(f.districts.length ? "Có GPS: trong 3 km · đường chim bay" : "Trong 3 km · đường chim bay");
    if (f.districts.length) labels.push("Thiếu GPS: theo quận đã chọn");
  }
  if (prices.minPrice !== null && prices.maxPrice !== null) labels.push(`Khoảng giá: ${money(prices.minPrice)} – ${money(prices.maxPrice)}đ`);
  else if (prices.minPrice !== null) labels.push(`Giá từ ${money(prices.minPrice)}đ`);
  else if (prices.maxPrice !== null) labels.push(`Giá đến ${money(prices.maxPrice)}đ`);
  const location = Boolean(f.center || f.districts.length);
  const price = prices.minPrice !== null || prices.maxPrice !== null;
  const description = location && price ? "Các phòng trong khu vực bạn chọn, theo khoảng giá đề xuất và bộ lọc hiện tại."
    : location ? "Các phòng trong khu vực bạn chọn, giữ các bộ lọc hiện tại."
    : price ? "Các phòng theo khoảng giá đề xuất và bộ lọc hiện tại trên toàn khu vực."
    : "Các phòng cập nhật mới nhất phù hợp với từ khóa và bộ lọc hiện tại.";
  return { labels, description };
}

function expandDistricts(values: string[]) {
  return [...new Set(values.flatMap(value => { const number = value.match(/\d+/)?.[0]; return number ? [value, number] : [value]; }))];
}
function expandRoomTypes(values: string[]) {
  return [...new Set(values.flatMap(value => /^([12])\s*Phòng ngủ$/i.test(value) ? [value, `${value[0]}PN`] : [value]))];
}

export function recommendationRpcParams(filters: RecommendationFilters, excludeIds: string[]) {
  const prices = recommendationPrices(filters);
  return {
    p_search: normalizeHomeSearchKeyword(filters.search, false) || null,
    p_min_price: prices.minPrice, p_max_price: prices.maxPrice,
    p_districts: expandDistricts(filters.districts), p_room_types: expandRoomTypes(filters.roomTypes),
    p_move: filters.move, p_pet_policies: filters.petPolicies, p_contract_terms: filters.contractTerms,
    p_features: filters.features, p_statuses: filters.status ? filters.status.split(",").map(s => s.trim()).filter(Boolean) : ["Đang trống", "Sắp trống"],
    p_badge: filters.badge, p_exclude_ids: [...new Set(excludeIds)].slice(0, 20),
    p_center_lat: filters.center?.latitude ?? null, p_center_lng: filters.center?.longitude ?? null,
  };
}

// Bounded public API input; never accept raw SQL, a role, or private room fields.
export function parseRecommendationRequest(input: unknown): { filters: RecommendationFilters; excludeIds: string[] } {
  if (!input || typeof input !== "object") throw new Error("Bộ lọc không hợp lệ");
  const body = input as Record<string, unknown>;
  if (!body.filters || typeof body.filters !== "object") throw new Error("Thiếu bộ lọc");
  const raw = body.filters as Record<string, unknown>;
  const text = (value: unknown, max = 120) => {
    if (value == null) return "";
    if (typeof value !== "string" || value.length > max) throw new Error("Giá trị bộ lọc không hợp lệ");
    return value.trim();
  };
  const list = (value: unknown, allowed?: readonly string[]) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 20) throw new Error("Danh sách bộ lọc không hợp lệ");
    const result = [...new Set(value.map(v => text(v)).filter(Boolean))];
    if (allowed && result.some(v => !allowed.includes(v))) throw new Error("Bộ lọc không được hỗ trợ");
    return result;
  };
  const price = (value: unknown) => {
    if (value == null) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw new Error("Giá không hợp lệ");
    return value;
  };
  const minPrice = price(raw.minPrice), maxPrice = price(raw.maxPrice);
  if (raw.priceFilterActive === true && minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Error("Khoảng giá không hợp lệ");
  const move = text(raw.move);
  if (move && !["elevator", "stairs"].includes(move)) throw new Error("Bộ lọc di chuyển không hợp lệ");
  const status = text(raw.status) || null;
  if (status && status.split(",").some(s => !["Đang trống", "Sắp trống", "Đã thuê"].includes(s.trim()))) throw new Error("Trạng thái không hợp lệ");
  const badge = text(raw.badge) || null;
  if (badge && !ROOM_BADGES.some(b => b.id === badge)) throw new Error("Nhãn không hợp lệ");
  let center: RecommendationFilters["center"] = null;
  if (raw.center != null) {
    const p = raw.center as Record<string, unknown>;
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number" || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)
      || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) throw new Error("Tọa độ không hợp lệ");
    center = { latitude: p.latitude, longitude: p.longitude };
  }
  const excludeIds = list(body.excludeIds);
  if (excludeIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error("Mã phòng không hợp lệ");
  return { filters: {
    search: text(raw.search), priceFilterActive: raw.priceFilterActive === true, minPrice, maxPrice,
    districts: list(raw.districts), roomTypes: list(raw.roomTypes), move: move as RecommendationFilters["move"] || null,
    petPolicies: list(raw.petPolicies, ["cat", "dog", "nopet"]) as RecommendationFilters["petPolicies"],
    contractTerms: list(raw.contractTerms, ["short", "long"]) as RecommendationFilters["contractTerms"],
    features: list(raw.features, ["balcony", "window"]) as RoomFeature[], status, badge: badge as RoomBadge | null,
    sortMode: text(raw.sortMode), center,
  }, excludeIds };
}
