import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "../filterOptions";
import { normalizeRoomFeatures } from "../rooms/features";
import { normalizeHomeSearchKeyword } from "../rooms/search";

type Filters = {
  minPrice?: number;
  maxPrice?: number;
  districts?: string[];
  roomTypes?: string[];
  amenities?: string[];
};

export function customerSearchDetails(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return;
  // Count searches with contact information without storing the search text.
  if (value.length > 120 || /@|https?:|www\.|(?:\d[ .()+-]*){8,}/iu.test(value)) return {};
  const namedWard = value.trim().normalize("NFC").match(/^(?:phường|phuong|p\.)\s*([\p{L}\p{M}][\p{L}\p{M}\d .-]*)$/iu)?.[1];
  if (namedWard) {
    const ward = namedWard.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi-VN");
    return { keyword: `phường ${ward}`, ward };
  }
  const keyword = normalizeHomeSearchKeyword(value, false);
  if (!keyword) return;
  const ward = keyword.match(/^phường (\d{1,3})$/u)?.[1];
  return { keyword, ...(ward ? { ward } : {}) };
}

export function customerFilterDetails(value: unknown): Filters {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const filterOptions = (raw: unknown, allowed: readonly string[]) =>
    Array.isArray(raw) ? allowed.filter(option => raw.includes(option)) : [];
  const price = (raw: unknown) => typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 && raw <= 1_000_000_000 ? raw : undefined;
  const minPrice = price(input.minPrice);
  const maxPrice = price(input.maxPrice);
  const districts = filterOptions(input.districts, DISTRICT_OPTIONS);
  const roomTypes = filterOptions(input.roomTypes, ROOM_TYPE_OPTIONS);
  const amenities = normalizeRoomFeatures(input.amenities).sort();
  return {
    ...(minPrice === undefined ? {} : { minPrice }), ...(maxPrice === undefined ? {} : { maxPrice }),
    ...(districts.length ? { districts } : {}), ...(roomTypes.length ? { roomTypes } : {}),
    ...(amenities.length ? { amenities } : {}),
  };
}

export function changedCustomerFilters(before: Filters, after: Filters): Filters {
  return {
    ...(before.minPrice !== after.minPrice || before.maxPrice !== after.maxPrice ? { minPrice: after.minPrice, maxPrice: after.maxPrice } : {}),
    ...(JSON.stringify(before.districts) !== JSON.stringify(after.districts) ? { districts: after.districts } : {}),
    ...(JSON.stringify(before.roomTypes) !== JSON.stringify(after.roomTypes) ? { roomTypes: after.roomTypes } : {}),
    ...(JSON.stringify(before.amenities) !== JSON.stringify(after.amenities) ? { amenities: after.amenities } : {}),
  };
}
