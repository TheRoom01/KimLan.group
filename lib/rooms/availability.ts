/** Date-only values: never convert through the browser's timezone. */
export function isAvailabilityDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function roomStatusLabel(status: string | null | undefined, availableFrom?: string | null) {
  const label = status || "Đang trống";
  return label === "Sắp trống" && isAvailabilityDate(availableFrom)
    ? `${label} - ${availableFrom.slice(8, 10)}/${availableFrom.slice(5, 7)}`
    : label;
}

export function requireAvailabilityDate(status: unknown, value: unknown): string | null {
  if (status !== "Sắp trống") return null;
  if (!isAvailabilityDate(value)) throw new Error("Vui lòng chọn ngày trống hợp lệ cho phòng Sắp trống");
  return value;
}

/** Used when publishing a newly created room; the database normalizes other saves. */
export function resolveRoomAvailability<T extends string>(status: T, availableFrom: string | null, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return status === "Sắp trống" && availableFrom && availableFrom <= today
    ? { status: "Đang trống" as const, available_from: null }
    : { status, available_from: availableFrom };
}
