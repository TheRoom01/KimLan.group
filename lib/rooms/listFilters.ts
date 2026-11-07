import { normalizeRoomBadges, type RoomBadge } from "@/lib/roomBadges";
import { normalizeRoomFeatures, roomFeatureStatusTokens, type RoomFeature } from "@/lib/rooms/features";
import { normalizeHomeSearchKeyword } from "@/lib/rooms/search";

type SortMode = "updated_desc" | "price_asc" | "price_desc";
type Move = "elevator" | "stairs";
type Pet = "cat" | "dog" | "nopet";
type Term = "short" | "long";

export const HOME_PRICE_DEFAULT: [number, number] = [3_000_000, 30_000_000];

function sortMode(value?: string | null): SortMode {
  return value === "price_asc" || value === "price_desc" ? value : "updated_desc";
}

function finitePrice(value?: string | number | null) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(values?: readonly string[] | null) {
  return [...new Set((values ?? []).map(value => value.trim()).filter(Boolean))].sort();
}

function pets(values?: readonly string[] | null) {
  return list(values).filter((value): value is Pet => value === "cat" || value === "dog" || value === "nopet");
}

function terms(values?: readonly string[] | null) {
  return list(values).filter((value): value is Term => value === "short" || value === "long");
}

function move(value?: string | null): Move | null {
  return value === "elevator" || value === "stairs" ? value : null;
}

export function readHomeListFilters(get: (key: string) => string | null) {
  const min = finitePrice(get("min"));
  const max = finitePrice(get("max"));
  const low = min ?? HOME_PRICE_DEFAULT[0];
  const high = max ?? HOME_PRICE_DEFAULT[1];
  return {
    search: get("q")?.trim() ?? "",
    priceApplied: [Math.min(low, high), Math.max(low, high)] as [number, number],
    priceFilterActive: min !== null || max !== null,
    selectedDistricts: list(get("d")?.split(",")),
    selectedRoomTypes: list((get("t") ?? get("rt"))?.split(",")),
    moveFilter: move(get("m")),
    petFilters: pets(get("pet")?.split(",")),
    termFilters: terms(get("term")?.split(",")),
    featureFilters: normalizeRoomFeatures(get("features")),
    sortMode: sortMode(get("s")),
    statusFilter: list(get("st")?.split(",")).join(",") || null,
    badgeFilter: normalizeRoomBadges([get("badge")])[0] ?? null,
  };
}

export type HomeListFilters = ReturnType<typeof readHomeListFilters>;
export const DEFAULT_HOME_LIST_FILTERS = readHomeListFilters(() => null);

export function readHomeListPage(get: (key: string) => string | null) {
  const page = Number(get("p") ?? 0);
  const raw = get("c");
  if (!Number.isSafeInteger(page) || page <= 0 || page > 10_000) return { nextPage: 0, c: null };
  if (get("view") === "saved") return { nextPage: page, c: null };
  if (!raw) return { nextPage: 0, c: null };
  try {
    const json = typeof window === "undefined"
      ? Buffer.from(raw, "base64url").toString("utf8")
      : decodeURIComponent(escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))));
    const cursor: unknown = JSON.parse(json);
    if (typeof cursor === "string" && cursor) return { nextPage: page, c: cursor };
    if (cursor && typeof cursor === "object" && "id" in cursor && typeof cursor.id === "string" && cursor.id &&
      "updated_at" in cursor && typeof cursor.updated_at === "string" && "created_at" in cursor && typeof cursor.created_at === "string") {
      const searchScore = "search_score" in cursor && typeof cursor.search_score === "number" ? cursor.search_score : undefined;
      return { nextPage: page, c: { id: cursor.id, updated_at: cursor.updated_at, created_at: cursor.created_at, search_score: searchScore } };
    }
  } catch {
    // A malformed shared cursor falls back to the first page of its filters.
  }
  return { nextPage: 0, c: null };
}

type ListingQuery = {
  adminLevel?: 0 | 1 | 2;
  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  districts?: string[] | null;
  roomTypes?: string[] | null;
  roomType?: string | null;
  move?: Move | null;
  petPolicies?: Pet[] | null;
  contractTerms?: Term[] | null;
  status?: string | null;
  badge?: RoomBadge | null;
  featureFilters?: RoomFeature[];
  sortMode?: SortMode | null;
};

export function roomListFilterRpcParams(filters: ListingQuery) {
  const roomTypes = filters.roomTypes?.length ? filters.roomTypes : filters.roomType ? [filters.roomType] : [];
  const districts = list(list(filters.districts).flatMap(value => [value, value.match(/\d+/)?.[0] ?? ""]));
  const types = list(list(roomTypes).flatMap(value => [value, /^([12])\s*Phòng ngủ$/i.test(value) ? `${value[0]}PN` : ""]));
  const statuses = list([
    ...(filters.status?.split(",") ?? []),
    ...(filters.badge ? [`__badge:${filters.badge}`] : []),
    ...roomFeatureStatusTokens(filters.featureFilters),
  ]);
  const petPolicies = pets(filters.petPolicies);
  const contractTerms = terms(filters.contractTerms);
  const isAdmin = filters.adminLevel === 1 || filters.adminLevel === 2;
  return {
    p_search: normalizeHomeSearchKeyword(filters.search, isAdmin) || null,
    p_min_price: finitePrice(filters.minPrice),
    p_max_price: finitePrice(filters.maxPrice),
    p_districts: districts.length ? districts : null,
    p_room_types: types.length ? types : null,
    p_move: move(filters.move),
    p_pet_policies: petPolicies.length ? petPolicies : null,
    p_contract_terms: contractTerms.length ? contractTerms : null,
    p_statuses: statuses.length ? statuses : null,
    p_sort: sortMode(filters.sortMode),
  };
}
