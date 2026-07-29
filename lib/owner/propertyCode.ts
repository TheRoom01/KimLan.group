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

function streetInitials(value: unknown) {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(đường|duong|street)$/i.test(word));

  return words
    .slice(0, 2)
    .map((word) => {
      const first = word.charAt(0);
      if (/đ/i.test(first)) return "Đ";
      return first.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    })
    .join("");
}

function districtCode(value: unknown) {
  const raw = String(value ?? "").trim();
  const number = raw.match(/\d+/)?.[0];
  if (number) return `Q${number}`;
  return streetInitials(raw) || compactPart(raw).slice(0, 4);
}

export function generatePropertyCode(input: {
  houseNumber?: unknown;
  address?: unknown;
  district?: unknown;
}) {
  const parts = [
    compactPart(input.houseNumber),
    streetInitials(input.address),
    districtCode(input.district),
  ].filter(Boolean);

  return parts.join(".").slice(0, 50) || null;
}
