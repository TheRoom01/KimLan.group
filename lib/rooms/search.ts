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
