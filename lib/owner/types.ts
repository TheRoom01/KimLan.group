export const ROOM_STATUSES = [
  "Đang trống",
  "Đã thuê",
  "Sắp trống",
] as const;

export type RoomStatus =
  (typeof ROOM_STATUSES)[number];


export const CONTRACT_STATUSES = [
  "Chờ nhận phòng",
  "Đang hiệu lực",
  "Đã kết thúc",
  "Đã hủy",
] as const;


export type ContractStatus =
  (typeof CONTRACT_STATUSES)[number];


export function normalizeContractStatus(
  value: unknown
): ContractStatus | null {

  switch (value) {

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
    case "Đã hủy":
      return "Đã hủy";


    default:
      return null;
  }
}


export function isActiveContractStatus(
  value: unknown
) {

  const status =
    normalizeContractStatus(value);

  return (
    status === "Đang hiệu lực" ||
    status === "Chờ nhận phòng"
  );
}