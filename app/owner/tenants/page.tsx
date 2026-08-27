import { Users } from "lucide-react";
import type { TenantCardData } from "@/components/owner/TenantCard";
import { getOwnerTenants } from "@/lib/owner/getOwnerTenants";
import OwnerExportButton from "@/components/owner/OwnerExportButton";
import TenantSearchList from "@/components/owner/TenantSearchList";

export default async function TenantsPage() {
  const tenants = (await getOwnerTenants()) as TenantCardData[];

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
          <Users size={15} />
          Quản lý cư trú
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">
          Khách thuê
        </h1>
        <p className="mt-1 text-sm text-[#7f6651]">
          {tenants.length} khách thuê thuộc các tòa nhà bạn quản lý.
        </p>
        </div>
        <OwnerExportButton href="/api/owner/exports/tenants" label="Xuất Excel / Trang tính" />
      </div>

      {tenants.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center text-sm text-[#80634a]">
          Chưa có khách thuê.
        </div>
      ) : (
        <TenantSearchList tenants={tenants} />
      )}
    </div>
  );
}
