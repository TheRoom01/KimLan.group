import type { SupabaseClient } from "@supabase/supabase-js";

type AnySupabase = SupabaseClient<any, any, any>;

import {
  normalizeDistrict,
  normalizeForCompare,
  normalizeRoomCode,
  normalizeWard,
} from "./parser";

function isEmptyValue(v: any) {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (typeof v === "number" && !Number.isFinite(v))
  );
}

function sameText(a: any, b: any) {
  return (
    normalizeForCompare(String(a || "")) ===
    normalizeForCompare(String(b || ""))
  );
}

function sameDistrict(a: any, b: any) {
  return (
    normalizeDistrict(String(a || "")) ===
    normalizeDistrict(String(b || ""))
  );
}

function sameRoomCode(a: any, b: any) {
  return (
    normalizeRoomCode(String(a || "")) ===
    normalizeRoomCode(String(b || ""))
  );
}

/**
 * Chuẩn hóa dữ liệu tòa nhà trước khi tìm phòng trùng.
 *
 * Bảo vệ các trường hợp payload cũ lưu:
 * - house_number: "25"
 * - address: "25 Song Hành"
 *
 * thành:
 * - house_number: "25"
 * - address: "Song Hành"
 */
function normalizeBuildingPayload(
  roomPayload: Record<string, any>
) {
  let houseNumber = String(
    roomPayload.house_number || ""
  ).trim();

  let address = String(
    roomPayload.address || ""
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!houseNumber && address) {
    const splitMatch = address.match(
      /^(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*)(?:\s+)(.+)$/i
    );

    if (splitMatch?.[1] && splitMatch?.[2]) {
      houseNumber = splitMatch[1].trim();
      address = splitMatch[2].trim();
    }
  }

  if (houseNumber && address) {
    const escapedHouseNumber =
      houseNumber.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    address = address
      .replace(
        new RegExp(
          `^${escapedHouseNumber}\\s+`,
          "i"
        ),
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  roomPayload.house_number =
    houseNumber;

  roomPayload.address = address;

  if (!isEmptyValue(roomPayload.ward)) {
    roomPayload.ward = normalizeWard(
      String(roomPayload.ward)
    );
  }

  if (!isEmptyValue(roomPayload.district)) {
    roomPayload.district =
      normalizeDistrict(
        String(roomPayload.district)
      );
  }

  if (!isEmptyValue(roomPayload.room_code)) {
    roomPayload.room_code =
      normalizeRoomCode(
        String(roomPayload.room_code)
      );
  }
}

/**
 * Mặc định phòng có máy giặt chung khi:
 * - Tin Zalo không nói rõ;
 * - Không lấy được dữ liệu từ phòng cùng nhà.
 *
 * Giá trị false rõ ràng vẫn được giữ nguyên.
 */
function applyDetailDefaults(
  detailPayload: Record<string, any>,
  inheritedFieldMap: Record<string, string>
) {
  if (
    isEmptyValue(
      detailPayload.shared_washer
    )
  ) {
    detailPayload.shared_washer = true;

    if (
      !inheritedFieldMap.shared_washer
    ) {
      inheritedFieldMap.shared_washer =
        "Mặc định có máy giặt chung";
    }
  }
}

export async function resolveZaloImportRoom(params: {
  supabase: AnySupabase;
  roomPayload: Record<string, any>;
  detailPayload: Record<string, any>;
}) {
  const { supabase } = params;

  const roomPayload = {
    ...(params.roomPayload || {}),
  };

  const detailPayload = {
    ...(params.detailPayload || {}),
  };

  const inheritedFieldMap: Record<
    string,
    string
  > = {};

  let matchedRoom: any | null = null;
  let matchedReason = "";

  normalizeBuildingPayload(roomPayload);

  const houseNumber = String(
    roomPayload.house_number || ""
  ).trim();

  const address = String(
    roomPayload.address || ""
  ).trim();

  const district = String(
    roomPayload.district || ""
  ).trim();

  const roomCode = String(
    roomPayload.room_code || ""
  ).trim();

  if (!houseNumber || !address || !district) {
    applyDetailDefaults(
      detailPayload,
      inheritedFieldMap
    );

    return {
      roomPayload,
      detailPayload,
      inheritedFieldMap,
      matchedRoom: null,
      matchedReason: "",
    };
  }

  const { data: candidates, error } =
    await supabase
      .from("rooms")
      .select(
        [
          "id",
          "room_code",
          "room_type",
          "house_number",
          "address",
          "ward",
          "district",
          "price",
          "status",
          "description",
          "chinh_sach",
          "link_zalo",
          "zalo_phone",
          "lat",
          "lng",
          "updated_at",
        ].join(",")
      )
      .eq("house_number", houseNumber)
      .order("updated_at", {
        ascending: false,
      })
      .limit(100);

  if (error) throw error;

  const sameBuildingRooms =
    (candidates || []).filter(
      (room: any) => {
        return (
          sameText(
            room.house_number,
            houseNumber
          ) &&
          sameText(
            room.address,
            address
          ) &&
          sameDistrict(
            room.district,
            district
          )
        );
      }
    );

  if (roomCode) {
    matchedRoom =
      sameBuildingRooms.find(
        (room: any) =>
          sameRoomCode(
            room.room_code,
            roomCode
          )
      ) || null;

    if (matchedRoom) {
      matchedReason =
        "Trùng số nhà + đường + quận + mã phòng";

      applyDetailDefaults(
        detailPayload,
        inheritedFieldMap
      );

      return {
        roomPayload,
        detailPayload,
        inheritedFieldMap,
        matchedRoom,
        matchedReason,
      };
    }
  }

  const sampleRoom:
    | Record<string, any>
    | null =
    (sameBuildingRooms[0] as
      | Record<string, any>
      | undefined) || null;

  if (!sampleRoom) {
    applyDetailDefaults(
      detailPayload,
      inheritedFieldMap
    );

    return {
      roomPayload,
      detailPayload,
      inheritedFieldMap,
      matchedRoom: null,
      matchedReason: "",
    };
  }

  const inheritRoomFields: string[] = [
    "ward",
    "link_zalo",
    "zalo_phone",
    "chinh_sach",
    "lat",
    "lng",
  ];

  for (const field of inheritRoomFields) {
    if (
      isEmptyValue(roomPayload[field]) &&
      !isEmptyValue(sampleRoom[field])
    ) {
      roomPayload[field] = sampleRoom[field];
      inheritedFieldMap[field] =
        "Tự điền từ phòng cùng nhà";
    }
  }

  const {
    data: fullRoom,
    error: detailErr,
  } = await supabase.rpc(
    "fetch_room_detail_full_v1",
    {
      p_id: sampleRoom.id,
      p_role: 0,
    }
  );

  if (detailErr) {
    applyDetailDefaults(
      detailPayload,
      inheritedFieldMap
    );

    return {
      roomPayload,
      detailPayload,
      inheritedFieldMap,
      matchedRoom: null,
      matchedReason:
        "Cùng nhà nhưng không lấy được chi tiết phòng mẫu",
    };
  }

  const fullRoomAny: any = fullRoom;

  const sampleDetail:
    | Record<string, any>
    | null =
    fullRoomAny?.room_detail ||
    fullRoomAny?.room_details ||
    fullRoomAny?.detail ||
    fullRoomAny?.details ||
    null;

  if (sampleDetail) {
    const inheritDetailFields = [
      "electric_fee_value",
      "electric_fee_unit",
      "water_fee_value",
      "water_fee_unit",
      "service_fee_value",
      "service_fee_unit",
      "parking_fee_value",
      "parking_fee_unit",
      "other_fee_value",
      "other_fee_note",
      "has_elevator",
      "has_stairs",
      "shared_washer",
      "private_washer",
      "shared_dryer",
      "private_dryer",
      "has_parking",
      "has_basement",
      "fingerprint_lock",
      "allow_pet",
      "allow_cat",
      "allow_dog",
      "no_pet",
      "short_term",
      "long_term",
      "other_amenities",
      "detail_json",
    ];

    for (
      const field of
      inheritDetailFields
    ) {
      if (
        isEmptyValue(
          detailPayload[field]
        ) &&
        !isEmptyValue(
          sampleDetail[field]
        )
      ) {
        detailPayload[field] =
          sampleDetail[field];

        inheritedFieldMap[field] =
          "Tự điền từ phòng cùng nhà";
      }
    }
  }

  applyDetailDefaults(
    detailPayload,
    inheritedFieldMap
  );

  return {
    roomPayload,
    detailPayload,
    inheritedFieldMap,
    matchedRoom: null,
    matchedReason:
      "Tìm thấy phòng cùng nhà để tự điền dữ liệu thiếu",
  };
}
