import { getOwnerContracts } from "@/lib/owner/getOwnerContracts";
import { csvDate, csvResponse } from "@/lib/owner/csv";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import { normalizeContractStatus, type OwnerContractSummary } from "@/lib/owner/types";

export async function GET() {
  const contracts = (await getOwnerContracts()) as OwnerContractSummary[];
  return csvResponse(
    `hop-dong-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Khách thuê", "Số điện thoại", "Tòa nhà", "Phòng", "Trạng thái", "Ngày bắt đầu", "Ngày kết thúc", "Giá thuê/tháng", "Tiền cọc"],
    contracts.map((contract) => [
      contract.tenant?.full_name,
      contract.tenant?.phone,
      propertyDisplayAddress(contract.property),
      contract.room?.room_code,
      normalizeContractStatus(contract.status) ?? contract.status,
      csvDate(contract.start_date),
      csvDate(contract.end_date),
      contract.monthly_price,
      contract.deposit_amount,
    ]),
  );
}
