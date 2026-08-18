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
  chinh_sach: string | null;

  publish_status:
    | "draft"
    | "published"
    | "hidden"
    | null;
};


const ROOM_PUBLISH_STATUSES = [
  "draft",
  "published",
  "hidden",
] as const;


type RoomPublishStatus =
  (typeof ROOM_PUBLISH_STATUSES)[number];

export function parseUpdateOwnerRoomInput(
  body: JsonObject,
): UpdateOwnerRoomInput {

  const publishStatus =
    parseOptionalString(
      body.publish_status,
      "Trạng thái đăng tin",
      50,
    );


  if (
    publishStatus &&
    !ROOM_PUBLISH_STATUSES.includes(
      publishStatus as RoomPublishStatus,
    )
  ) {
    throw new RequestValidationError(
      "Trạng thái đăng tin không hợp lệ",
      {
        field: "publish_status",
      },
    );
  }


  return {

    room_type:
      parseOptionalString(
        body.room_type,
        "Loại phòng",
        120,
      ),


    price:
      parseNonNegativeInteger(
        body.price,
        "Giá phòng",
        {
          optional: true,
        },
      ),


    description:
      parseOptionalString(
        body.description,
        "Mô tả",
        5000,
      ),


    chinh_sach:
      parseOptionalString(
        body.chinh_sach,
        "Chính sách",
        5000,
      ),


    publish_status:
      publishStatus as RoomPublishStatus | null,

  };
}

export type UpdateOwnerRoomStatusInput = {

  status: RoomStatus;

  note: string | null;

};


export function parseUpdateOwnerRoomStatusInput(
  body: JsonObject,
): UpdateOwnerRoomStatusInput {

  const status =
    String(body.status ?? "")
      .trim();


  if (!isRoomStatus(status)) {

    throw new RequestValidationError(
      "Trạng thái phòng không hợp lệ",
      {
        field: "status",
      },
    );

  }


  return {

    status,

    note:
      parseOptionalString(
        body.note,
        "Ghi chú",
        500,
      ),

  };

}

export type CreateOwnerContractInput = {
  contract_type: "lease" | "deposit";
  full_name: string;
  phone: string | null;
  cccd: string | null;
  start_date: string;
  end_date: string;
  monthly_price: number;
  deposit_amount: number;
  booking_total_amount: number;
};

export function parseCreateOwnerContractInput(
  body: JsonObject,
): CreateOwnerContractInput {
  const startDate = parseDate(body.start_date, "Ngày bắt đầu");
  const endDate = parseDate(body.end_date, "Ngày kết thúc");

  assertDateRange(startDate, endDate);

  const contractType = String(body.contract_type ?? "lease").trim();
  if (contractType !== "lease" && contractType !== "deposit") {
    throw new RequestValidationError("Loại hợp đồng không hợp lệ", { field: "contract_type" });
  }

  return {
    contract_type: contractType,
    full_name: parseRequiredString(body.full_name, "Họ tên", 200),
    phone: parseOptionalString(body.phone, "Số điện thoại", 30),
    cccd: parseOptionalString(body.cccd, "CCCD", 30),
    start_date: startDate,
    end_date: endDate,
    monthly_price:
      parseNonNegativeInteger(body.monthly_price, "Giá thuê") ?? 0,
    deposit_amount:
      parseNonNegativeInteger(body.deposit_amount, "Tiền cọc") ?? 0,
    booking_total_amount:
      parseNonNegativeInteger(body.booking_total_amount, "Tổng tiền cần thanh toán") ?? 0,
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

function parseOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
  } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new RequestValidationError(`${fieldName} phải là một số hợp lệ`, {
      field: fieldName,
    });
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new RequestValidationError(
      `${fieldName} không được nhỏ hơn ${options.min}`,
      { field: fieldName, min: options.min },
    );
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new RequestValidationError(
      `${fieldName} không được lớn hơn ${options.max}`,
      { field: fieldName, max: options.max },
    );
  }

  return parsed;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

export type CreateOwnerPropertyInput = {
  code: string | null;
  name: string | null;
  house_number: string;
  address: string;
  ward: string | null;
  district: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  cover_image: string | null;
  gallery_images: string[];
  google_maps_url: string | null;
  default_room_data: JsonObject;
  note: string | null;
};

export function parseCreateOwnerPropertyInput(
  body: JsonObject,
): CreateOwnerPropertyInput {
  const galleryImages = Array.isArray(body.gallery_images)
    ? body.gallery_images
        .map((value) => parseOptionalString(value, "Ảnh tòa nhà", 2000))
        .filter((value): value is string => Boolean(value))
        .slice(0, 20)
    : [];

  return {
    code: parseOptionalString(body.code, "Mã tòa nhà", 50),
    name: parseOptionalString(body.name, "Tên tòa nhà", 200),
    house_number: parseRequiredString(body.house_number, "Số nhà", 100),
    address: parseRequiredString(body.address, "Địa chỉ", 500),
    ward: parseOptionalString(body.ward, "Phường/xã", 120),
    district: parseRequiredString(body.district, "Quận/huyện", 120),
    city:
      parseOptionalString(body.city, "Tỉnh/thành phố", 120) ??
      "Hồ Chí Minh",
    latitude: parseOptionalFiniteNumber(body.latitude, "Vĩ độ", {
      min: -90,
      max: 90,
    }),
    longitude: parseOptionalFiniteNumber(body.longitude, "Kinh độ", {
      min: -180,
      max: 180,
    }),
    cover_image: parseOptionalString(body.cover_image, "Ảnh đại diện", 2000),
    gallery_images: galleryImages,
    google_maps_url: parseOptionalString(body.google_maps_url, "Link Google Maps", 2000),
    default_room_data:
      body.default_room_data && typeof body.default_room_data === "object" && !Array.isArray(body.default_room_data)
        ? (body.default_room_data as JsonObject)
        : {},
    note: parseOptionalString(body.note, "Ghi chú", 5000),
  };
}

const ROOM_DETAIL_BOOLEAN_FIELDS = [
  "has_elevator",
  "has_stairs",
  "shared_washer",
  "private_washer",
  "shared_dryer",
  "private_dryer",
  "has_parking",
  "has_basement",
  "fingerprint_lock",
  "free_time",
  "allow_pet",
  "allow_cat",
  "allow_dog",
  "no_pet",
  "short_term",
  "long_term",
] as const;

const ROOM_DETAIL_FEE_FIELDS = [
  "electric_fee_value",
  "water_fee_value",
  "service_fee_value",
  "parking_fee_value",
  "other_fee_value",
] as const;

const ROOM_DETAIL_TEXT_FIELDS = [
  "electric_fee_unit",
  "water_fee_unit",
  "service_fee_unit",
  "parking_fee_unit",
  "other_fee_note",
  "other_amenities",
] as const;

function parseRoomDetails(value: unknown): JsonObject | null {
  if (value === null || value === undefined) return null;

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Chi tiết phòng phải là JSON object", {
      field: "room_details",
    });
  }

  const source = value as JsonObject;
  const details: JsonObject = {};

  for (const field of ROOM_DETAIL_FEE_FIELDS) {
    const parsed = parseOptionalFiniteNumber(source[field], field, { min: 0 });
    if (source[field] !== undefined) details[field] = parsed;
  }

  for (const field of ROOM_DETAIL_TEXT_FIELDS) {
    const parsed = parseOptionalString(source[field], field, 2000);
    if (source[field] !== undefined) details[field] = parsed;
  }

  for (const field of ROOM_DETAIL_BOOLEAN_FIELDS) {
    const parsed = parseOptionalBoolean(source[field]);
    if (parsed !== undefined) details[field] = parsed;
  }

  if (
    source.detail_json !== undefined &&
    (source.detail_json === null ||
      typeof source.detail_json !== "object" ||
      Array.isArray(source.detail_json))
  ) {
    throw new RequestValidationError("detail_json phải là JSON object", {
      field: "detail_json",
    });
  }

  if (source.detail_json !== undefined) {
    details.detail_json = source.detail_json;
  }

  return details;
}

export type CreateOwnerRoomInput = {
  status: RoomStatus;

  room_code: string;

  room_type: string | null;

  price: number | null;

  description: string | null;

  chinh_sach: string | null;


  // Cho phép nhập khi tạo mới
  link_zalo: string | null;

  zalo_phone: string | null;

  google_maps_url: string | null;

  house_number: string | null;
  address: string | null;
  ward: string | null;
  district: string | null;


  room_details: JsonObject | null;

};

export function parseCreateOwnerRoomInput(
  body: JsonObject,
): CreateOwnerRoomInput {

  return {
    status: isRoomStatus(String(body.status ?? "")) ? (String(body.status) as RoomStatus) : "Đang trống",

    room_code:
      parseRequiredString(
        body.room_code,
        "Mã phòng",
        100,
      ),


    room_type:
      parseOptionalString(
        body.room_type,
        "Loại phòng",
        120,
      ),


    price:
      parseNonNegativeInteger(
        body.price,
        "Giá phòng",
        {
          optional:true,
        },
      ),


    description:
      parseOptionalString(
        body.description,
        "Mô tả",
        5000,
      ),


    chinh_sach:
      parseOptionalString(
        body.chinh_sach,
        "Chính sách",
        5000,
      ),


    link_zalo:
      parseOptionalString(
        body.link_zalo,
        "Liên kết Zalo",
        2000,
      ),


    zalo_phone:
      parseOptionalString(
        body.zalo_phone,
        "Số Zalo",
        30,
      ),

    google_maps_url: parseOptionalString(
      body.google_maps_url,
      "Link Google Maps",
      2000,
    ),

    house_number: parseOptionalString(body.house_number, "Số nhà", 300),
    address: parseOptionalString(body.address, "Địa chỉ", 1000),
    ward: parseOptionalString(body.ward, "Phường / xã", 300),
    district: parseOptionalString(body.district, "Quận / huyện", 300),


    room_details:
      parseRoomDetails(
        body.room_details ?? body.details,
      ),

  };

}

export type InvitePropertyManagerInput = {
  email: string | null;
  phone: string | null;
  invitee_name: string | null;
  expires_in_days: number;
};

export function parseInvitePropertyManagerInput(
  body: JsonObject,
): InvitePropertyManagerInput {
  const email = parseOptionalString(body.email, "Email", 320)?.toLowerCase() ?? null;
  const phoneRaw = parseOptionalString(body.phone, "Số điện thoại", 40);
  const phone = phoneRaw?.replace(/\D/g, "") || null;

  if (!email && !phone) {
    throw new RequestValidationError("Cần nhập email hoặc số điện thoại", {
      fields: ["email", "phone"],
    });
  }

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new RequestValidationError("Email không hợp lệ", {
      field: "email",
    });
  }

  if (phone && phone.length < 8) {
    throw new RequestValidationError("Số điện thoại không hợp lệ", {
      field: "phone",
    });
  }

  const expires =
    parseNonNegativeInteger(body.expires_in_days ?? 14, "Thời hạn lời mời") ?? 14;

  if (expires < 1 || expires > 30) {
    throw new RequestValidationError("Thời hạn lời mời phải từ 1 đến 30 ngày", {
      field: "expires_in_days",
    });
  }

  return {
    email,
    phone,
    invitee_name: parseOptionalString(body.invitee_name, "Tên người được mời", 200),
    expires_in_days: expires,
  };
}
