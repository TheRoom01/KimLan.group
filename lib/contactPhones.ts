export type ContactPhone = { dial: string; display: string };

export function extractContactPhones(value: unknown): ContactPhone[] {
  const source = String(value ?? "").trim();
  if (!source) return [];

  const matches = source.match(/(?:\+?84|0)(?:[\s().-]*\d){9}/g) ?? [];
  const unique = new Map<string, ContactPhone>();
  for (const match of matches) {
    const digits = match.replace(/\D/g, "");
    const national = digits.startsWith("84") && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;
    if (!/^0\d{9}$/.test(national) || unique.has(national)) continue;
    unique.set(national, {
      dial: national,
      display: national.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3"),
    });
  }
  return Array.from(unique.values());
}
