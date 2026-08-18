import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, Home } from "lucide-react";
import { getOwnerContracts } from "@/lib/owner/getOwnerContracts";
import {
  isClosedContractStatus,
  normalizeContractStatus,
  type OwnerContractSummary,
} from "@/lib/owner/types";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import ContractExportButton from "@/components/owner/ContractExportButton";

export default async function ContractsPage() {
  const contracts = (await getOwnerContracts()) as OwnerContractSummary[];

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
          <FileText size={15} />
          Quản lý hợp đồng
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">
          Hợp đồng
        </h1>
        <p className="mt-1 text-sm text-[#7f6651]">
          Tổng cộng {contracts.length} hợp đồng thuộc các tòa nhà bạn quản lý.
        </p>
        </div>
        <ContractExportButton />
      </div>

      <div className="flex gap-2"><span className="rounded-xl bg-[#744722] px-4 py-2 text-sm font-bold text-white">Hợp đồng thuê</span><Link href="/owner/deposits" className="rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] px-4 py-2 text-sm font-bold text-[#74583e]">Đặt cọc</Link></div>

      {contracts.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center text-sm text-[#80634a]">
          Chưa có hợp đồng.
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contracts.map((contract) => {
            const status =
              normalizeContractStatus(contract.status) ?? contract.status ?? "-";
            const statusClass =
              status === "Đang hiệu lực"
                ? "bg-blue-100 text-blue-700"
                : isClosedContractStatus(status)
                  ? "bg-gray-200 text-gray-600"
                  : "bg-[#ead3b3] text-[#684324]";

            return (
              <article
                key={contract.id}
                className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-[#432918]">
                      {contract.tenant?.full_name || "Chưa có người đại diện"}
                    </h2>
                    <p className="mt-1 text-xs text-[#80634a]">
                      {contract.tenant?.phone || "Chưa có SĐT"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass}`}>
                    {status}
                  </span>
                </div>

                <div className="mt-4 space-y-2 rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-3 text-sm text-[#74583e]">
                  <p className="flex items-start gap-2">
                    <Home size={15} className="mt-0.5 shrink-0 text-[#744722]" />
                    <span>
                      <strong className="text-[#4d3422]">
                        {propertyDisplayAddress(contract.property)}
                      </strong>
                      <span className="block text-xs text-[#80634a]">
                        Phòng {contract.room?.room_code || "-"}
                      </span>
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays size={15} className="shrink-0 text-[#744722]" />
                    {contract.start_date
                      ? new Date(contract.start_date).toLocaleDateString("vi-VN")
                      : "-"}{" "}
                    →{" "}
                    {contract.end_date
                      ? new Date(contract.end_date).toLocaleDateString("vi-VN")
                      : "-"}
                  </p>
                  <p className="font-semibold text-[#684324]">
                    {contract.monthly_price
                      ? `${Number(contract.monthly_price).toLocaleString("vi-VN")}đ/tháng`
                      : "Chưa cập nhật giá thuê"}
                  </p>
                </div>

                <Link
                  href={`/owner/contracts/${contract.id}`}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817]"
                >
                  Xem chi tiết
                  <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
