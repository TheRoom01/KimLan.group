import Link from "next/link";

import EditPropertyForm from "@/components/owner/EditPropertyForm";
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
      "id, code, name, house_number, address, ward, district, city, latitude, longitude, cover_image, gallery_images, google_maps_url, note, approval_status, lifecycle_status",
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chỉnh sửa tòa nhà</h1>
          <p className="mt-1 text-gray-500">
            Chỉ cập nhật thông tin nghiệp vụ; trạng thái duyệt do Admin quản lý.
          </p>
        </div>

        <Link
          href={`/owner/properties/${id}`}
          className="text-sm font-medium text-gray-600 hover:text-black"
        >
          ← Chi tiết tòa nhà
        </Link>
      </div>

      <EditPropertyForm property={property} />
    </div>
  );
}
