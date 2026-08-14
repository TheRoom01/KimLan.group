import { getOwnerTenants } from "@/lib/owner/getOwnerTenants";
import { csvResponse } from "@/lib/owner/csv";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import type { TenantCardData } from "@/components/owner/TenantCard";

export async function GET() {
  const tenants = (await getOwnerTenants()) as TenantCardData[];
  return csvResponse(
    `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Họ tên", "Số điện thoại", "CCCD", "Vai trò", "Tòa nhà", "Phòng", "Giá thuê/tháng", "Số hợp đồng"],
    tenants.flatMap((item) => item.tenant ? [[
      item.tenant.full_name,
      item.tenant.phone,
      item.tenant.cccd,
      item.active_contract?.tenant_role,
      propertyDisplayAddress(item.active_contract?.property),
      item.active_contract?.room?.room_code,
      item.active_contract?.monthly_price,
      item.contracts_count ?? 0,
    ]] : []),
  );
}
