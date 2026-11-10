export const tenantRoomFeatureOptions = [
  { value: "no_live_in_landlord", label: "Không chung chủ", column: "no_live_in_landlord" },
  { value: "accepts_foreign_tenants", label: "Nhận khách nước ngoài", column: "accepts_foreign_tenants" },
] as const;

export const roomFeatureOptions = [
  { value: "balcony", label: "Ban công", column: "has_balcony" },
  { value: "window", label: "Cửa sổ", column: "has_window" },
  ...tenantRoomFeatureOptions,
] as const;

export type RoomFeature = typeof roomFeatureOptions[number]["value"];

export function normalizeRoomFeatures(value: unknown): RoomFeature[] {
  const values = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return [...new Set(values.filter((item): item is RoomFeature => roomFeatureOptions.some(option => option.value === item)))];
}
export function roomFeatureStatusTokens(value: unknown) {
  return normalizeRoomFeatures(value).map(feature => `__amenity:${feature}`);
}
export function matchesRoomFeatures(detail: Record<string, any>, value: unknown) {
  const features = normalizeRoomFeatures(value);
  return roomFeatureOptions.every(option => !features.includes(option.value) || detail[option.column] === true);
}
