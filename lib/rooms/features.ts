export type RoomFeature = "balcony" | "window";
export function normalizeRoomFeatures(value: unknown): RoomFeature[] {
  const values = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return [...new Set(values.filter((item): item is RoomFeature => item === "balcony" || item === "window"))];
}
export function roomFeatureStatusTokens(value: unknown) {
  return normalizeRoomFeatures(value).map(feature => `__amenity:${feature}`);
}
export function matchesRoomFeatures(detail: Record<string, any>, value: unknown) {
  return normalizeRoomFeatures(value).every(feature => detail[feature === "balcony" ? "has_balcony" : "has_window"] === true);
}
