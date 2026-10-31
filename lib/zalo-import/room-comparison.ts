// Shared, pure rules for import identity, field presence and review UI.
import { normalizedStreetKey, knownStreetIdentity } from "../rooms/street";
export const ROOM_UPDATE_FIELDS = ["room_type", "ward", "price", "status", "available_from", "description", "chinh_sach"] as const;
export const DETAIL_UPDATE_FIELDS = [
  "electric_fee_value", "electric_fee_unit", "water_fee_value", "water_fee_unit", "service_fee_value", "service_fee_unit",
  "parking_fee_value", "parking_fee_unit", "other_fee_value", "other_fee_note", "has_elevator", "has_stairs",
  "shared_washer", "private_washer", "shared_dryer", "private_dryer", "has_parking", "has_basement", "fingerprint_lock",
  "free_time", "allow_pet", "allow_cat", "allow_dog", "no_pet", "short_term", "long_term", "other_amenities", "detail_json", "has_balcony", "has_window",
] as const;
export type ImportType = "CREATE" | "UPDATE" | "NEEDS_REVIEW";
export type RoomSnapshot = { room: Record<string, any>; detail: Record<string, any> | null; media: any[] };
export type ImportReview = {
  version: 1; type: ImportType; identity_key: string | null; reason: string;
  candidate_ids: string[]; conflicting_pending_ids: string[]; snapshot: RoomSnapshot | null;
  presence: Record<string, "value" | "clear">; uncertain_fields: string[];
  image_hashes?: Record<string, string>;
  video_hashes?: Record<string, string>;
  change_status?: "CHANGED" | "UNCERTAIN";
  changed_fields?: string[];
};
export function fold(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}
export function normalizedRoomIdentity(payload: Record<string, any>) {
  const house = String(payload.house_number ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, "");
  let street = fold(payload.address).replace(/[.,;:()]+/g, " ").replace(/\s+/g, " ").trim();
  // Legacy rooms sometimes repeat the house number in the street field.
  if (house) street = street.replace(new RegExp(`^${fold(house).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  street = normalizedStreetKey(street);
  let district = fold(payload.district).replace(/^(?:(?:quan|huyen|thanh pho)(?=[\s\d])\s*|(?:q|h|tp)(?=[\s.:-\d])\s*[.:-]?\s*)/i, "").replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (/^\d+$/.test(district)) district = String(Number(district));
  const code = String(payload.room_code ?? "").normalize("NFC").toLowerCase().replace(/^(?:(?:phòng|phong)(?:\s+|[.:]\s*)|p\s*\.\s*)/i, "").replace(/\s+/g, "");
  if (!/^\d/.test(house) || !street || !district || !code) return null;
  // Separators and letters in house/code remain significant (12/3 != 123).
  return JSON.stringify([house, street, district, code]);
}
export function canonicalStoredIdentity(key: string | null) {
  try {
    const parts=JSON.parse(key || "null");
    if(!Array.isArray(parts)||parts.length!==4||parts.some(part=>typeof part!=="string"))return null;
    return normalizedRoomIdentity({house_number:parts[0],address:parts[1],district:parts[2],room_code:parts[3]});
  }catch{return null;}
}
export function classifyRoomIdentity(payload: Record<string, any>, rooms: any[], pending: any[] = [], excludePendingId?: string) {
  const key = normalizedRoomIdentity(payload);
  const matches = key ? rooms.filter(room => normalizedRoomIdentity(room) === key) : [];
  const conflicts = key ? pending.filter(row => row.id !== excludePendingId && row.room_payload?.is_test_import !== true &&
    ["Chờ duyệt", "Trùng phòng", "Cần xác minh"].includes(row.status) && normalizedRoomIdentity(row.room_payload || {}) === key) : [];
  const inactive = matches.some(room => room.deleted_at || (room.lifecycle_status && room.lifecycle_status !== "active"));
  const accentedStreet = (room: any) => String(room.address || "").normalize("NFC").toLowerCase()
    .replace(new RegExp(`^${String(room.house_number || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
    .replace(/[.,;:()]+/g, " ").replace(/\s+/g, " ").trim();
  // Accent folding can find candidates, but two explicitly accented street
  // names that disagree are not enough evidence for an automatic merge.
  const toneConflict = matches.some(room => {
    const left=accentedStreet(room),right=accentedStreet(payload);
    if (knownStreetIdentity(left) && knownStreetIdentity(left) === knownStreetIdentity(right)) return false;
    return /[À-ỹĐđ]/.test(String(room.address)) && /[À-ỹĐđ]/.test(String(payload.address)) && left !== right;
  });
  const type: ImportType = !key || matches.length > 1 || conflicts.length || inactive || toneConflict ? "NEEDS_REVIEW" : matches.length === 1 ? "UPDATE" : "CREATE";
  return { key, matches, conflicts, type, reason: !key ? "Thiếu số nhà, tên đường, quận hoặc mã phòng." : matches.length > 1
    ? "Có nhiều phòng trùng khóa; cần xác minh phòng đích." : conflicts.length ? "Đã có bản nháp chưa duyệt cho cùng phòng." : inactive ? "Phòng trùng khóa đã lưu trữ/xóa; cần xác minh."
      : toneConflict ? "Tên đường có dấu không hoàn toàn giống nhau; cần xác minh."
      : matches.length === 1 ? "Trùng số nhà + đường + quận + mã phòng." : "Chưa có phòng trùng khóa đầy đủ." };
}
export function sourcePresence(room: Record<string, any>, detail: Record<string, any>, source: Record<string, any>, inherited: Record<string, any> = {}) {
  const presence: ImportReview["presence"] = {};
  for (const [scope, fields, payload] of [["room", ROOM_UPDATE_FIELDS, room], ["detail", DETAIL_UPDATE_FIELDS, detail]] as const) {
    for (const field of fields) {
      if (!source[field] || inherited[field] || !Object.hasOwn(payload, field)) continue;
      const value = payload[field];
      presence[`${scope}.${field}`] = value === null || value === "" ? "clear" : "value";
    }
  }
  return presence;
}
export function snapshotRoom(room: any, detail: any, media: any[]): RoomSnapshot {
  const fields = ["id", "updated_at", "lifecycle_status", "deleted_at", "house_number", "address", "district", "room_code", ...ROOM_UPDATE_FIELDS];
  return {
    room: Object.fromEntries(fields.filter(key => Object.hasOwn(room, key)).map(key => [key, room[key]])),
    detail: detail ? Object.fromEntries(["id", "updated_at", ...DETAIL_UPDATE_FIELDS].filter(key => Object.hasOwn(detail, key)).map(key => [key, detail[key]])) : null,
    media: media.map(row => ({ id: row.id, type: row.type, url: row.url ?? null, path: row.path ?? null,
      sort_order: row.sort_order ?? null, content_hash: row.content_hash ?? null })),
  };
}
export function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
export function getImportReview(room: any): ImportReview | null {
  return room?._room_import?.version === 1 ? room._room_import : null;
}
export function importReviewInstructions(room: Record<string, any>): string {
  const review = getImportReview(room);
  if (review?.type === "NEEDS_REVIEW" && !review.identity_key && normalizedRoomIdentity(room)) {
    return "Địa chỉ và mã phòng đã đủ, nhưng kết quả đối chiếu chưa được cập nhật. Mở rộng chi tiết, kiểm tra địa chỉ và mã phòng trong ô thông tin nguồn, rồi bấm Phân tích lại dữ liệu để xác định phòng mới hay cập nhật phòng đã có.";
  }
  return `${review?.reason || "Chưa xác định được phòng đích."} Mở rộng chi tiết, kiểm tra địa chỉ và mã phòng trong ô thông tin nguồn, rồi bấm Phân tích lại dữ liệu. Nếu có nhiều phòng trùng, kiểm tra các liên kết phòng hiện tại trước khi tiếp tục.`;
}
export function compareImageAlbums(oldImages: any[], newImages: any[], hashes: Record<string, string> = {}) {
  if (!newImages.length) return "missing" as const;
  if (!oldImages.length) return "changed" as const;
  const oldHashes = oldImages.map(image => image.content_hash || hashes[image.url || image.path]);
  const newHashes = newImages.map(image => image.content_hash || hashes[image.temp_image_url || image.url]);
  if (oldHashes.every(Boolean) && newHashes.every(Boolean)) {
    return stableJson(oldHashes.slice().sort()) === stableJson(newHashes.slice().sort()) ? "same" as const : "changed" as const;
  }
  // URLs and equal file counts do not prove content equality or inequality.
  return "uncertain" as const;
}
export function comparisonFields(room: any, detail: any) {
  const review = getImportReview(room);
  if (!review?.snapshot) return [];
  return ([...ROOM_UPDATE_FIELDS.map(field => ["room", field] as const), ...DETAIL_UPDATE_FIELDS.map(field => ["detail", field] as const)]).map(([scope, field]) => {
    const key = `${scope}.${field}`;
    const oldValue = (scope === "room" ? review.snapshot!.room : review.snapshot!.detail)?.[field] ?? null;
    const newValue = (scope === "room" ? room : detail)?.[field] ?? null;
    const present = !!review.presence[key];
    return { key, field, oldValue, newValue, state: review.uncertain_fields.includes(key) ? "uncertain" : !present ? "missing"
      : stableJson(oldValue) === stableJson(newValue) ? "same" : "changed", clear: review.presence[key] === "clear" };
  });
}
export function selectedUpdatePatch(room: any, detail: any, selected: string[]) {
  const review = getImportReview(room);
  if (!review || review.type !== "UPDATE" || !review.snapshot || normalizedRoomIdentity(room) !== canonicalStoredIdentity(review.identity_key)) throw new Error("Cần xác minh lại khóa phòng UPDATE.");
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) throw new Error("Hãy chọn ít nhất một trường cần cập nhật.");
  const fields = comparisonFields(room, detail);
  const patch = { room: {} as Record<string, any>, detail: {} as Record<string, any>, images: false, videos: false };
  for (const key of selected) {
    if (key === "images" || key === "videos") { patch[key] = true; continue; }
    const field = fields.find(item => item.key === key);
    if (!field || field.state === "missing" || field.state === "uncertain") throw new Error(`Trường ${key} không có dữ liệu mới đã xác minh.`);
    const [scope, name] = key.split(".");
    (patch[scope as "room" | "detail"])[name] = field.newValue;
  }
  return patch;
}

/** A corrected code may fork an UPDATE; its verified building and old target stay locked. */
export function isUpdateCodeChange(payload: Record<string, any>) {
  const review = getImportReview(payload);
  const originalCode = review?.snapshot?.room.room_code;
  const originalKey = review?.identity_key && canonicalStoredIdentity(review.identity_key);
  const nextKey = normalizedRoomIdentity(payload);
  return Boolean(review?.type === "UPDATE" && originalCode && originalKey && nextKey && nextKey !== originalKey &&
    normalizedRoomIdentity({ ...payload, room_code: originalCode }) === originalKey);
}
