// Shared by Home (SSR/client) and admin so identical queries reach the database.
export function normalizeSearchKeyword(value?: string | null) {
  const normalized = String(value ?? "")
    .normalize("NFC")

    // "Phường 13", "phuong 13", "Phường13" -> "13"
    .replace(/\b(?:phường|phuong)\s*(\d{1,3})\b/gi, "$1")

    // "Phường Đức Nhuận", "phuong Duc Nhuan" -> "Đức Nhuận" / "Duc Nhuan"
    .replace(/\b(?:phường|phuong)\s+/gi, "")

    // "P.13", "P. 13", "P. Đức Nhuận" -> "13" / "Đức Nhuận"
    .replace(/\bp\.\s*/gi, "")

    // "p13" -> "13"
    .replace(/\bp(?=\d{1,3}\b)/gi, "")

    // "p Đức Nhuận" -> "Đức Nhuận"
    .replace(/\bp\s+(?=\S)/gi, "")

    .replace(/[,\n\r\t]+/g, " ")
    .replace(/[|;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi-VN");

  return normalized.length >= 3 ? normalized : "";
}

/** Search only visible content; anon never matches the private house-number field. */
export function roomSearchableText(room: Record<string, any>, isAdmin: boolean) {
  const raw = room.room_detail ?? room.room_details ?? {};
  const detail = Array.isArray(raw) ? raw[0] ?? {} : raw;
  let content = normalizeSearchKeyword([room.description, detail.other_amenities].filter(Boolean).join(" "));
  if (!isAdmin && room.house_number) {
    const house = String(room.house_number).normalize("NFC").trim().toLocaleLowerCase("vi-VN");
    if (house) content = content.split(/\s+/).filter(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") !== house).join(" ");
  }
  return normalizeSearchKeyword([isAdmin ? room.house_number : "", isAdmin ? room.room_code : "", isAdmin ? room.room_type : "", room.address, room.ward, room.district, content].filter(Boolean).join(" "));
}

export function normalizeHomeSearchKeyword(value?: string | null) {
  const raw = String(value ?? "").normalize("NFC").trim();
  const scope = raw.match(/^(phường|phuong|p\.?|quận|quan|q\.?)\s*(\d{1,3})$/i);
  if (scope) return `${/^(quận|quan|q)/i.test(scope[1]) ? "quận" : "phường"} ${scope[2]}`;
  return normalizeSearchKeyword(raw);
}
export function roomMatchesSearch(room: Record<string, any>, query: string, isAdmin: boolean) {
  const needle = normalizeHomeSearchKeyword(query);
  if (!needle) return true;
  const scope = needle.match(/^(phường|quận) (\d{1,3})$/);
  if (scope) return String(room[scope[1] === "phường" ? "ward" : "district"] ?? "").replace(/(?:phường|phuong|p\.?|quận|quan|q\.?)\s*/gi, "").trim() === scope[2];
  return roomSearchableText(room, isAdmin).includes(needle);
}
