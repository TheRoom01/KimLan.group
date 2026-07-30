import Link from "next/link";

import PropertyCard from "@/components/owner/PropertyCard";
import { getProperties } from "@/lib/owner/getProperties";
import PropertyJoinRequestPanel from "@/components/owner/PropertyJoinRequestPanel";
import { Building2, Plus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PropertySuggestion = { id: string; code?: string | null; house_number?: string | null; address?: string | null; ward?: string | null; district?: string | null; city?: string | null };

export default async function PropertiesPage() {
  const properties = await getProperties();
  const supabase = await createSupabaseServerClient();
  const { data: suggestionData } = await supabase.rpc("get_my_phone_property_suggestions_v1");
  const suggestions = (Array.isArray(suggestionData?.suggestions) ? suggestionData.suggestions : []) as PropertySuggestion[];

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

      {suggestions.length ? <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-sm">
        <h2 className="font-bold text-[#4d3422]">Tòa nhà có thể liên quan đến số điện thoại của bạn</h2>
        <p className="mt-1 text-sm text-[#80634a]">Số điện thoại chỉ được dùng để gợi ý. Hệ thống không tự cấp quyền sở hữu hoặc quản lý.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{suggestions.map((property) => <div key={property.id} className="rounded-xl border border-[#aa825d]/20 bg-[#f7ead7] p-4"><p className="font-semibold text-[#503521]">{[property.house_number, property.address, property.ward, property.district, property.city].filter(Boolean).join(", ")}</p>{property.code ? <p className="mt-1 text-xs text-[#80634a]">Mã tòa nhà: {property.code}</p> : null}<Link href="/owner/properties/create" className="mt-3 inline-flex text-sm font-bold text-[#744722] hover:underline">Tạo yêu cầu xác minh quyền</Link></div>)}</div>
      </section> : null}

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
