function compactPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function streetCode(value: unknown) {
  return compactPart(String(value ?? "").replace(/^\s*(đường|duong|street)\s+/i, ""));
}

function districtCode(value: unknown) {
  const raw = String(value ?? "").trim();
  const number = raw.match(/\d+/)?.[0];
  if (number) return `Q${number}`;
  return compactPart(raw).slice(0, 12);
}

export function generatePropertyCode(input: {
  houseNumber?: unknown;
  address?: unknown;
  district?: unknown;
}) {
  const parts = [
    compactPart(input.houseNumber),
    streetCode(input.address),
    districtCode(input.district),
  ].filter(Boolean);

  return parts.join(".").slice(0, 50) || null;
}
