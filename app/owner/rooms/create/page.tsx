import Link from "next/link";

import CreateRoomForm from "@/components/owner/CreateRoomForm";
import RoomDefaultsSyncButton from "@/components/owner/RoomDefaultsSyncButton";
import { getPropertyDetail } from "@/lib/owner/getPropertyDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CreateRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string }>;
}) {
  const { property_id: propertyId } = await searchParams;

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

  const detail = await getPropertyDetail(propertyId);
  const property = detail.property;
  const supabase = await createSupabaseServerClient();
  const { data: propertyDefaults } = await supabase.from("properties").select("default_room_data").eq("id", propertyId).single();

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
        Không tìm thấy tòa nhà hoặc bạn không có quyền quản lý.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Tạo phòng</h1>
          <p className="mt-1 text-gray-500">
            Tòa nhà: {propertyDisplayAddress(property)}
          </p>
        </div>

        <RoomDefaultsSyncButton propertyId={propertyId} formId="create-room-form" />
        <Link
          href={`/owner/properties/${propertyId}`}
          className="text-sm font-medium text-gray-600 hover:text-black sm:justify-self-end"
        >
          ← Chi tiết tòa nhà
        </Link>
      </div>

      <CreateRoomForm
        propertyId={propertyId}
        defaults={{
          ...((propertyDefaults?.default_room_data as Record<string, any>) ?? {}),
          house_number: property.house_number ?? "",
          address: property.address ?? "",
          ward: property.ward ?? "",
          district: property.district ?? "",
        }}
      />
    </div>
  );
}
