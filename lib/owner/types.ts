export const ROOM_STATUSES = [
  "Đang trống",
  "Đã thuê",
  "Sắp trống",
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const CONTRACT_STATUSES = [
  "Chờ nhận phòng",
  "Đang hiệu lực",
  "Đã kết thúc",
  "Đã hủy",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PROPERTY_LIFECYCLE_STATUSES = [
  "active",
  "inactive",
  "archived",
] as const;

export type PropertyLifecycleStatus =
  (typeof PROPERTY_LIFECYCLE_STATUSES)[number];

export const PROPERTY_MEMBER_ROLES = [
  "owner",
  "manager",
  "viewer",
] as const;

export type PropertyMemberRole =
  (typeof PROPERTY_MEMBER_ROLES)[number];

export const PROPERTY_MEMBER_STATUSES = [
  "pending",
  "active",
  "suspended",
  "revoked",
] as const;

export type PropertyMemberStatus =
  (typeof PROPERTY_MEMBER_STATUSES)[number];

export function isRoomStatus(value: unknown): value is RoomStatus {
  return ROOM_STATUSES.includes(value as RoomStatus);
}

export function normalizeRoomStatus(value: unknown): RoomStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === "đang trống" || normalized === "trống") {
    return "Đang trống";
  }
  if (normalized === "đã thuê" || normalized === "thuê") {
    return "Đã thuê";
  }
  if (normalized === "sắp trống" || normalized === "ẩn") {
    return "Sắp trống";
  }

  return null;
}

export function normalizeContractStatus(
  value: unknown,
): ContractStatus | null {
  switch (String(value ?? "").trim()) {
    case "pending":
    case "Chờ nhận phòng":
      return "Chờ nhận phòng";

    case "active":
    case "Đang hiệu lực":
      return "Đang hiệu lực";

    case "ended":
    case "Đã kết thúc":
      return "Đã kết thúc";

    case "cancelled":
    case "canceled":
    case "Đã hủy":
      return "Đã hủy";

    default:
      return null;
  }
}

export function isActiveContractStatus(value: unknown): boolean {
  const status = normalizeContractStatus(value);
  return status === "Đang hiệu lực" || status === "Chờ nhận phòng";
}

export function isClosedContractStatus(value: unknown): boolean {
  const status = normalizeContractStatus(value);
  return status === "Đã kết thúc" || status === "Đã hủy";
}

export type OwnerPropertyReference = {
  id: string;
  code?: string | null;
  name?: string | null;
  house_number?: string | null;
  address?: string | null;
  district?: string | null;
  ward?: string | null;
  city?: string | null;
};

export type OwnerRoomReference = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
};

export type OwnerTenantReference = {
  id: string;
  full_name: string;
  phone?: string | null;
  cccd?: string | null;
};

export type OwnerContractSummary = {
  id: string;
  status: string;
  start_date: string;
  end_date?: string | null;
  monthly_price?: number | null;
  deposit_amount?: number | null;
  tenant?: OwnerTenantReference | null;
  room?: OwnerRoomReference | null;
  property?: OwnerPropertyReference | null;
};
