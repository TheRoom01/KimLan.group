import Link from "next/link";

import PropertyCard from "@/components/owner/PropertyCard";
import { getProperties } from "@/lib/owner/getProperties";
import PropertyJoinRequestPanel from "@/components/owner/PropertyJoinRequestPanel";
import { Building2, Plus } from "lucide-react";

export default async function PropertiesPage() {
  const properties = await getProperties();

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
            <Building2 size={15} />
            Quản lý tài sản
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">
            Danh sách tòa nhà
          </h1>
          <p className="mt-1 text-sm text-[#7f6651]">
            Tổng cộng: {properties.length} tài sản bạn có quyền truy cập
          </p>
        </div>

        <Link
          href="/owner/properties/create"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817] sm:w-auto"
        >
          <Plus size={17} />
          Thêm tòa nhà
        </Link>
      </div>
      
      <PropertyJoinRequestPanel />

      {properties.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center">
          <h2 className="text-lg font-bold text-[#4d3422]">Chưa có tòa nhà</h2>
          <p className="mt-2 text-sm text-[#80634a]">
            Tạo tài sản mới hoặc tham gia quản lý tòa nhà được chia sẻ bởi chủ sở hữu khác.
          </p>
          <Link
            href="/owner/properties/create"
            className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb]"
          >
            Tạo tòa nhà đầu tiên
          </Link>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
