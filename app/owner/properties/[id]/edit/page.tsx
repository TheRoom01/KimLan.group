import Link from "next/link";

import EditPropertyForm from "@/components/owner/EditPropertyForm";
import PropertyDefaultsFromRoomButton from "@/components/owner/PropertyDefaultsFromRoomButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_property",
    { p_property_id: id },
  );

  if (permissionError || canManage !== true) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
        Bạn không có quyền chỉnh sửa tòa nhà này.
      </div>
    );
  }

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, code, name, house_number, address, ward, district, city, latitude, longitude, cover_image, gallery_images, google_maps_url, default_room_data, note, approval_status, lifecycle_status, updated_at",
    )
    .eq("id", id)
    .single();

  if (error || !property) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
        Không tìm thấy tòa nhà.
      </div>
    );
  }

  const { count: roomCount } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id)
    .eq("lifecycle_status", "active");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Chỉnh sửa tòa nhà</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/owner/properties/${id}`}
            className="text-sm font-medium text-gray-600 hover:text-black"
          >
            ← Chi tiết tòa nhà
          </Link>
          {(roomCount ?? 0) > 0 ? (
            <PropertyDefaultsFromRoomButton propertyId={id} />
          ) : null}
        </div>
      </div>

      <EditPropertyForm key={property.updated_at} property={property} />
    </div>
  );
}
