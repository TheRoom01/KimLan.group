import {
  assertDateRange,
  parseDate,
  parseNonNegativeInteger,
  parseOptionalString,
  parseRequiredString,
  RequestValidationError,
  type JsonObject,
} from "@/lib/api/validation";
import {
  isRoomStatus,
  type RoomStatus,
} from "@/lib/owner/types";

export type UpdateOwnerRoomInput = {
  room_type: string | null;
  price: number | null;
  description: string | null;
};

export function parseUpdateOwnerRoomInput(
  body: JsonObject,
): UpdateOwnerRoomInput {
  return {
    room_type: parseOptionalString(body.room_type, "Loại phòng", 120),
    price: parseNonNegativeInteger(body.price, "Giá phòng", {
      optional: true,
    }),
    description: parseOptionalString(body.description, "Mô tả", 5000),
  };
}

export type UpdateOwnerRoomStatusInput = {
  status: RoomStatus;
  note: string | null;
};

export function parseUpdateOwnerRoomStatusInput(
  body: JsonObject,
): UpdateOwnerRoomStatusInput {
  const status = String(body.status ?? "").trim();

  if (!isRoomStatus(status)) {
    throw new RequestValidationError("Trạng thái phòng không hợp lệ", {
      field: "status",
    });
  }

  return {
    status,
    note: parseOptionalString(body.note, "Ghi chú", 500),
  };
}

export type CreateOwnerContractInput = {
  full_name: string;
  phone: string | null;
  cccd: string | null;
  start_date: string;
  end_date: string;
  monthly_price: number;
  deposit_amount: number;
};

export function parseCreateOwnerContractInput(
  body: JsonObject,
): CreateOwnerContractInput {
  const startDate = parseDate(body.start_date, "Ngày bắt đầu");
  const endDate = parseDate(body.end_date, "Ngày kết thúc");

  assertDateRange(startDate, endDate);

  return {
    full_name: parseRequiredString(body.full_name, "Họ tên", 200),
    phone: parseOptionalString(body.phone, "Số điện thoại", 30),
    cccd: parseOptionalString(body.cccd, "CCCD", 30),
    start_date: startDate,
    end_date: endDate,
    monthly_price:
      parseNonNegativeInteger(body.monthly_price, "Giá thuê") ?? 0,
    deposit_amount:
      parseNonNegativeInteger(body.deposit_amount, "Tiền cọc") ?? 0,
  };
}

export type RenewOwnerContractInput = {
  start_date: string;
  end_date: string;
  monthly_price: number;
};

export function parseRenewOwnerContractInput(
  body: JsonObject,
): RenewOwnerContractInput {
  const startDate = parseDate(body.start_date, "Ngày bắt đầu");
  const endDate = parseDate(body.end_date, "Ngày kết thúc");

  assertDateRange(startDate, endDate);

  return {
    start_date: startDate,
    end_date: endDate,
    monthly_price:
      parseNonNegativeInteger(body.monthly_price, "Giá thuê") ?? 0,
  };
}
