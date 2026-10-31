// Call only with the street component, never with a room code or a date.
export function knownStreetIdentity(value: unknown): string | null {
  const text = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi,"d")
    .toLowerCase().trim().replace(/^duong\s+/,"").replace(/\s+/g," ");
  if (/^(?:3\s*thang\s*2|3\s*\/\s*2|ba\s+thang\s+hai)$/.test(text)) return "3 thang 2";
  if (/^(?:cmt0?8|cht0?8|cach\s*mang\s*(?:t0?8|thang\s*(?:0?8|tam)))$/.test(text)) return "cach mang thang 8";
  return null;
}
export function normalizedStreetKey(value: unknown) {
  return knownStreetIdentity(value) || String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/gi,"d").toLowerCase().replace(/[.,;:()]+/g," ").replace(/\s+/g," ").trim();
}
