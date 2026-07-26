import Link from "next/link";
import RenewContractModal from "@/components/owner/RenewContractModal";
import EndContractButton from "@/components/owner/EndContractButton";
import { getContractDetail } from "@/lib/owner/getContractDetail";
import {
  isActiveContractStatus,
  normalizeContractStatus,
} from "@/lib/owner/types";

function formatDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString("vi-VN")
    : "-";
}

function formatMoney(value?: number | null) {
  return value === null || value === undefined
    ? "-"
    : `${Number(value).toLocaleString("vi-VN")}đ`;
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contract = await getContractDetail(id);
  const normalizedStatus =
    normalizeContractStatus(contract.status) ?? contract.status;

  const propertyName =
    contract.property?.name ??
    [
      contract.property?.house_number,
      contract.property?.address,
      contract.property?.district,
    ]
      .filter(Boolean)
      .join(" ") ??
    "-";

  const canRenew =
    normalizedStatus !== "Đã hủy" &&
    Boolean(contract.start_date && contract.end_date);
  const canEnd = isActiveContractStatus(contract.status);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Chi tiết hợp đồng</h1>
          <p className="text-gray-500">Hợp đồng thuê phòng</p>
        </div>

        <Link
          href="/owner/contracts"
          className="rounded-lg border px-4 py-2"
        >
          ← Danh sách hợp đồng
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Khách thuê</h2>
        <div className="space-y-2">
          <p>
            <strong>Họ tên:</strong>{" "}
            {contract.tenant?.full_name ?? "-"}
          </p>
          <p>
            <strong>SĐT:</strong>{" "}
            {contract.tenant?.phone ?? "-"}
          </p>
          <p>
            <strong>CCCD:</strong>{" "}
            {contract.tenant?.cccd ?? "-"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Phòng</h2>
        <div className="space-y-2">
          <p>
            <strong>Tòa nhà:</strong> {propertyName || "-"}
          </p>
          <p>
            <strong>Phòng:</strong>{" "}
            {contract.room?.room_code ?? "-"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Thông tin hợp đồng
        </h2>

        <div className="space-y-2">
          <p>
            <strong>Bắt đầu:</strong> {formatDate(contract.start_date)}
          </p>
          <p>
            <strong>Kết thúc:</strong> {formatDate(contract.end_date)}
          </p>
          <p>
            <strong>Giá thuê:</strong>{" "}
            {formatMoney(contract.monthly_price)}
          </p>
          <p>
            <strong>Tiền cọc:</strong>{" "}
            {formatMoney(contract.deposit_amount)}
          </p>
          <p>
            <strong>Trạng thái:</strong> {normalizedStatus}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {canRenew && (
              <RenewContractModal
                contractId={contract.id}
                currentPrice={Number(contract.monthly_price ?? 0)}
                currentStartDate={contract.start_date}
                currentEndDate={contract.end_date}
              />
            )}

            {canEnd && (
              <EndContractButton contractId={contract.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
