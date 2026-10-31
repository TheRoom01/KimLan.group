export function vacancyDateFromText(text: string, importedAt: string | number | Date = new Date()) {
  const match = text.trim().match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?$/);
  if (!match) return null;
  const imported = new Date(importedAt);
  if (!match[3] && !Number.isFinite(imported.getTime())) return null;
  const year = match[3] ? Number(match[3]) : Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(imported));
  const month = Number(match[2]), day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
export function withoutStructuredAmenities(text: string, window: boolean, balcony: boolean) {
  const redundant = (item: string) => {
    const normalized = item.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
    return (window && /^(?:cs|cua so)$/.test(normalized)) || (balcony && /^(?:bc|ban cong)$/.test(normalized));
  };
  return text.split("\n").map(line => {
    const parts = line.split(/[;,]/);
    return parts.some(redundant) ? parts.filter(item => item.trim() && !redundant(item)).map(item => item.trim()).join(", ") : line;
  }).filter(line => line.trim()).join("\n");
}
