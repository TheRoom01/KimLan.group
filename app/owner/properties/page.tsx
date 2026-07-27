import Link from "next/link";

import PropertyCard from "@/components/owner/PropertyCard";
import { getProperties } from "@/lib/owner/getProperties";

export default async function PropertiesPage() {
  const properties = await getProperties();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Danh sách tòa nhà</h1>
          <p className="mt-1 text-gray-500">
            Tổng cộng: {properties.length} tòa nhà bạn đang tham gia quản lý
          </p>
        </div>

        <Link
          href="/owner/properties/create"
          className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Tạo tòa nhà
        </Link>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Chưa có tòa nhà</h2>
          <p className="mt-2 text-sm text-gray-500">
            Tạo tòa nhà đầu tiên hoặc chấp nhận lời mời manager từ một owner khác.
          </p>
          <Link
            href="/owner/properties/create"
            className="mt-5 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Tạo tòa nhà đầu tiên
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property: any) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
