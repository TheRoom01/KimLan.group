import { getOwnerContracts } from "@/lib/owner/getOwnerContracts";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import { normalizeContractStatus, type OwnerContractSummary } from "@/lib/owner/types";
import { createContractWorkbook, sanitizeFilename, xlsxResponse, type XlsxCell } from "@/lib/owner/xlsx";

export async function GET() {
  const contracts = (await getOwnerContracts()) as OwnerContractSummary[];
  const exportedAt = new Date();
  const headers = ["STT", "Khách thuê", "Số điện thoại", "Tòa nhà", "Phòng", "Trạng thái", "Ngày bắt đầu", "Ngày kết thúc", "Giá thuê/tháng", "Tiền cọc"];
  const rows: XlsxCell[][] = contracts.map((contract, index) => [
    { type: "text", value: String(index + 1) },
    { type: "text", value: contract.tenant?.full_name },
    { type: "text", value: contract.tenant?.phone },
    { type: "text", value: propertyDisplayAddress(contract.property) },
    { type: "text", value: contract.room?.room_code },
    { type: "text", value: normalizeContractStatus(contract.status) ?? contract.status },
    { type: "date", value: contract.start_date },
    { type: "date", value: contract.end_date },
    { type: "number", value: contract.monthly_price },
    { type: "number", value: contract.deposit_amount },
  ]);
  const buffer = await createContractWorkbook({
    title: "DANH SÁCH HỢP ĐỒNG THUÊ",
    propertyLabel: "Tất cả tòa nhà",
    exportedAt,
    headers,
    rows,
  });
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(exportedAt);
  return xlsxResponse(buffer, sanitizeFilename(`Hop_dong_thue_Tat_ca_toa_nha_${date}.xlsx`));
}
