export type PendingLocation = { latitude: number; longitude: number };
export function readPendingLocation(value: unknown): PendingLocation | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Vị trí không hợp lệ.");
  const point = value as PendingLocation;
  if (typeof point.latitude !== "number" || typeof point.longitude !== "number" || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error("Tọa độ vị trí không hợp lệ.");
  return { latitude: point.latitude, longitude: point.longitude };
}
export function importLocationQueries(house: string, street: string, ward: string) {
  const number = house.trim().match(/^(?:hẻm\s*)?(\d+[a-z]?)/i)?.[1];
  const road = street.trim().replace(new RegExp(`^${house.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  const area = ward.trim() && (/^(phường|p[.\s]|xã|thị trấn)/i.test(ward.trim()) ? ward.trim() : `Phường ${ward.trim()}`);
  const fallback = [road, area].filter(Boolean).join(", ");
  return road ? [...new Set([number ? [`Hẻm ${number} ${road}`, area].filter(Boolean).join(", ") : fallback, fallback])] : [];
}
/** Publishing has already succeeded; a location failure must not trigger publication rollback. */
export async function applyPendingLocation(actor: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }> } | undefined, roomId: string, payload: Record<string, unknown>) {
  if (!Object.hasOwn(payload, "_pending_location")) return null;
  try {
    const point = readPendingLocation(payload._pending_location);
    if (!actor) throw new Error("Thiếu phiên admin để lưu vị trí.");
    const result = await actor.rpc("update_admin_room_property_location_v1", { p_room_id: roomId, p_latitude: point?.latitude ?? null, p_longitude: point?.longitude ?? null });
    if (result.error) throw new Error(result.error.message || "Không thể lưu vị trí.");
    return null;
  } catch (error) { return `Đã duyệt phòng; chưa lưu được vị trí tòa nhà: ${error instanceof Error ? error.message : String(error)}`; }
}
