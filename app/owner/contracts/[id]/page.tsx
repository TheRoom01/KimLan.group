import Link from "next/link";
import RenewContractModal from "@/components/owner/RenewContractModal";
import EndContractButton from "@/components/owner/EndContractButton";
import { getContractDetail } from "@/lib/owner/getContractDetail";
import {
  isActiveContractStatus,
  normalizeContractStatus,
} from "@/lib/owner/types";
import TenantRosterCard from "@/components/owner/TenantRosterCard";

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
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
            Quản lý hợp đồng
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">Chi tiết hợp đồng</h1>
          <p className="text-sm text-[#80634a]">Hợp đồng thuê phòng</p>
        </div>

        <Link
          href="/owner/contracts"
          className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324]"
        >
          ← Danh sách hợp đồng
        </Link>
      </div>

      <TenantRosterCard
        tenants={contract.tenants ?? (contract.tenant ? [contract.tenant] : [])}
        roomId={contract.room?.id ?? ""}
        canManage={false}
        isArchived={false}
      />

      <div className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-[#4f321e]">Phòng</h2>
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

      <div className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-[#4f321e]">
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
