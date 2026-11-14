export function isNaturalRoomSearch(query: string) {
  return /(?:^|\s)(?:tìm|cần|muốn|gần|quanh|dưới|trên|tầm|khoảng|tối đa|tối thiểu)(?:\s|$)/iu.test(query);
}

export function normalizePlace(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// https://hotro.ueh.edu.vn/bai-viet/dia-chi-cac-co-so-cua-ueh-12008
const campuses = [
  ["A", "59C Nguyễn Đình Chiểu", "Xuân Hòa"],
  ["B", "279 Nguyễn Tri Phương", "Diên Hồng"],
  ["C", "91 đường 3/2", "Vườn Lài"],
  ["D", "196 Trần Quang Khải", "Tân Định"],
  ["E", "54 Nguyễn Văn Thủ", "Tân Định"],
  ["H", "1A Hoàng Diệu", "Phú Nhuận"],
  ["I", "17 Phạm Ngọc Thạch", "Xuân Hòa"],
  ["N", "Nguyễn Văn Linh", "Bình Hưng"],
  ["V", "232/6 Võ Thị Sáu", "Xuân Hòa"],
  ["", "144 Phạm Đức Sơn", "Phú Định"],
] as const;

export function findUehCampuses(query: string) {
  const normalized = normalizePlace(query);
  if (!/\b(?:ueh|dai hoc kinh te)\b/.test(normalized)) return [];
  const campus = normalized.match(/\b(?:co so|ueh) ([abcdehinv])\b/)?.[1];
  const matches = campuses.filter(([code, address]) =>
    campus ? code.toLowerCase() === campus : normalized.includes(normalizePlace(address)));
  return (matches.length ? matches : campuses).map(([code, address, ward]) => ({
    label: code ? `UEH cơ sở ${code} · ${address}` : `UEH · ${address}`,
    address,
    lookup: `${address}, ${ward}, Thành phố Hồ Chí Minh`,
  }));
}

export type NearbyRoomCenter = { label: string; latitude: number; longitude: number };
