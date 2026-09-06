export const PROPERTY_STATUSES = ["Hoạt động", "Tạm ngưng", "Đang bảo trì", "Lưu trữ"] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export function isPropertyStatus(value: unknown): value is PropertyStatus {
  return typeof value === "string" && PROPERTY_STATUSES.some((status) => status === value);
}
