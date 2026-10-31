import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRoomIdentity, sourcePresence, snapshotRoom, type ImportReview } from "./room-comparison";
import { hashRoomImage } from "@/lib/r2/zalo-temp";
import { normalizedStreetKey } from "../rooms/street";

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
      /^(\d+[A-Za-z\d]*(?:\/\d+[A-Za-z\d]*)*)(?:\s+)(.+)$/i
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

export async function resolveZaloImportRoom(params: {
  supabase: AnySupabase;
  roomPayload: Record<string, any>;
  detailPayload: Record<string, any>;
  sourceFieldMap?: Record<string, any>;
  excludePendingId?: string;
  skipInheritance?: boolean;
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
  const review: ImportReview = { version: 1, type: "NEEDS_REVIEW", identity_key: null,
    reason: "Thiếu số nhà, tên đường, quận hoặc mã phòng.", candidate_ids: [], conflicting_pending_ids: [], snapshot: null,
    presence: sourcePresence(roomPayload, detailPayload, params.sourceFieldMap || {}),
    uncertain_fields: roomPayload.available_from_text && !roomPayload.available_from ? ["room.available_from"] : [] };
  roomPayload._room_import = review;

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

  if (!houseNumber || !address || !district || !roomCode) {
    return {
      roomPayload,
      detailPayload,
      inheritedFieldMap,
      matchedRoom: null,
      matchedReason: "",
    };
  }

  // Superset by the first house-number digits, then exact normalized matching.
  // Paging avoids silently choosing CREATE when the true match is past row 100.
  const digits = houseNumber.match(/\d+/)?.[0];
  const candidates: any[] = [];
  const pendingCandidates: any[] = [];
  if (!digits) return { roomPayload, detailPayload, inheritedFieldMap, matchedRoom, matchedReason: review.reason };
  for (const table of ["rooms", "pending_room_versions"]) {
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from(table).select("*").ilike(table === "rooms" ? "house_number" : "room_payload->>house_number", `%${digits}%`);
      if (table === "pending_room_versions") query = query.in("status", ["Chờ duyệt", "Trùng phòng", "Cần xác minh"]);
      const result = await query.order("id").range(offset, offset + 499);
      if (result.error) throw result.error;
      (table === "rooms" ? candidates : pendingCandidates).push(...(result.data || []));
      if ((result.data || []).length < 500) break;
    }
  }
  const classification = classifyRoomIdentity(roomPayload, candidates, pendingCandidates, params.excludePendingId);
  Object.assign(review, { type: classification.type, identity_key: classification.key, reason: classification.reason,
    candidate_ids: classification.matches.map(room => room.id), conflicting_pending_ids: classification.conflicts.map(row => row.id) });
  if (review.type === "NEEDS_REVIEW") return { roomPayload, detailPayload, inheritedFieldMap, matchedRoom, matchedReason: review.reason };

  const sameBuildingRooms =
    (candidates || []).filter(
      (room: any) => {
        return (
          sameText(
            room.house_number,
            houseNumber
          ) &&
          normalizedStreetKey(
            room.address,
          ) === normalizedStreetKey(address) &&
          sameDistrict(
            room.district,
            district
          )
        );
      }
    );

  if (roomCode) {
    matchedRoom = classification.matches[0] || null;

    if (matchedRoom) {
      const [details, media] = await Promise.all([
        supabase.from("room_details").select("*").eq("room_id", matchedRoom.id).maybeSingle(),
        supabase.from("room_media").select("*").eq("room_id", matchedRoom.id).order("sort_order"),
      ]);
      if (details.error) throw details.error;
      if (media.error) throw media.error;
      const roomMedia = media.data || [];
      const images = roomMedia.filter((row: any) => row.type === "image");
      const deadline = Date.now() + 15000;
      let nextImage = 0;
      await Promise.all(Array.from({ length: Math.min(images.length, 4) }, async () => {
        while (nextImage < images.length && Date.now() < deadline) {
          const image = images[nextImage++];
          image.content_hash = await hashRoomImage(matchedRoom.id, image.url || image.path, Math.min(10000, deadline - Date.now())).catch(() => null);
        }
      }));
      review.snapshot = snapshotRoom(matchedRoom, details.data, roomMedia);
      matchedReason =
        "Trùng số nhà + đường + quận + mã phòng";

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

  if (!sampleRoom || params.skipInheritance) {
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
      "free_time",
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

  return {
    roomPayload,
    detailPayload,
    inheritedFieldMap,
    matchedRoom: null,
    matchedReason:
      "Tìm thấy phòng cùng nhà để tự điền dữ liệu thiếu",
  };
}
