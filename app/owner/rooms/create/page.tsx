import Link from "next/link";

import CreateRoomForm from "@/components/owner/CreateRoomForm";
import RoomDefaultsSyncButton from "@/components/owner/RoomDefaultsSyncButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CreateRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; copy_from?: string }>;
}) {
  const { property_id: propertyId, copy_from: copyFrom } = await searchParams;

  if (!propertyId || !UUID_PATTERN.test(propertyId)) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Thiếu tòa nhà</h1>
        <p className="mt-2 text-gray-600">
          Cần chọn một tòa nhà hợp lệ trước khi tạo phòng.
        </p>
        <Link
          href="/owner/properties"
          className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Chọn tòa nhà
        </Link>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [propertyResult, copiedRoomResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, house_number, address, ward, district, city, google_maps_url, default_room_data")
      .eq("id", propertyId)
      .single(),
    copyFrom && UUID_PATTERN.test(copyFrom)
      ? supabase
          .from("rooms")
          .select(`
            id, property_id, room_code, room_type, price, description, chinh_sach, link_zalo,
            zalo_phone, google_maps_url, house_number, address, ward, district,
            room_details (*),
            room_media (id, type, url, is_cover, sort_order)
          `)
          .eq("id", copyFrom)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const property = propertyResult.data;
  const rawCopiedRoom = copiedRoomResult.data;
  const copiedRoom = rawCopiedRoom?.property_id === propertyId
    ? {
        ...rawCopiedRoom,
        details: Array.isArray(rawCopiedRoom.room_details)
          ? rawCopiedRoom.room_details[0] ?? null
          : rawCopiedRoom.room_details,
        media: [...(rawCopiedRoom.room_media ?? [])].sort(
          (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
        ),
      }
    : null;

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
        Không tìm thấy tòa nhà hoặc bạn không có quyền quản lý.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">{copiedRoom ? `Copy phòng ${copiedRoom.room_code}` : "Tạo phòng"}</h1>
          <p className="mt-1 text-gray-500">
            Tòa nhà: {propertyDisplayAddress(property)}
          </p>
        </div>

        <Link
          href={`/owner/properties/${propertyId}`}
          className="shrink-0 text-sm font-medium text-gray-600 hover:text-black"
        >
          ← Chi tiết tòa nhà
        </Link>
      </div>

      <div className="flex justify-end">
        <RoomDefaultsSyncButton propertyId={propertyId} formId="create-room-form" />
      </div>

      <CreateRoomForm
        propertyId={propertyId}
        copySourceRoomId={copiedRoom?.id}
        defaults={{
          // Database JSON contains mixed scalar and nested values.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...((property.default_room_data as Record<string, any>) ?? {}),
          ...(copiedRoom ? { ...copiedRoom, room_code: "", status: "Đang trống", room_details: copiedRoom.details ?? {} } : {}),
          // Legacy rooms may not have their own location. Do not let null copied
          // values erase the selected property's address in the create form.
          house_number: copiedRoom?.house_number ?? property.house_number ?? "",
          address: copiedRoom?.address ?? property.address ?? "",
          ward: copiedRoom?.ward ?? property.ward ?? "",
          district: copiedRoom?.district ?? property.district ?? "",
          google_maps_url: copiedRoom?.google_maps_url ?? property.google_maps_url ?? "",
        }}
      />
    </div>
  );
}
