export function formatZaloPhones(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const explicit = source.split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit.join("\n");
  const digits = source.replace(/\D/g, "");
  const phones = digits.match(/0\d{9}/g);
  return phones && phones.join("").length === digits.length ? phones.join("\n") : source;
}
