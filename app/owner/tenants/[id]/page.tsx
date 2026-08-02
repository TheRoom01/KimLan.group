import Link from "next/link";
import { CalendarDays, KeyRound, Phone, UserRound } from "lucide-react";
import { getTenantDetail } from "@/lib/owner/getTenantDetail";
import TenantProfileEditor from "@/components/owner/TenantProfileEditor";
import { propertyDisplayAddress, type PropertyAddressLike } from "@/lib/owner/propertyDisplayAddress";

type TenantContractHistory = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  deposit_amount?: number | null;
  status?: string | null;
  room?: { id?: string | null; room_code?: string | null } | null;
  property?: PropertyAddressLike | null;
};

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getTenantDetail(id);
  const tenant = data?.tenant;

  if (!tenant) {
    return (
      <div className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-6 text-[#80634a]">
        Không tìm thấy thông tin khách thuê.
      </div>
    );
  }

  const activeContract = data.activeContract;
  const room = activeContract?.room;
  const contracts = (data.contracts ?? []) as TenantContractHistory[];

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
            Hồ sơ khách thuê
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">
            {tenant.full_name}
          </h1>
          <p className="mt-1 text-sm text-[#80634a]">
            Thông tin cá nhân và lịch sử hợp đồng
          </p>
        </div>
        <Link
          href="/owner/tenants"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 text-sm font-semibold text-[#684324]"
        >
          ← Danh sách khách thuê
        </Link>
      </div>

      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="flex items-center gap-2">
          <UserRound size={20} className="text-[#744722]" />
          <h2 className="text-lg font-bold text-[#4f321e]">Thông tin cá nhân</h2>
        </div>
        <TenantProfileEditor tenant={tenant} roomId={room?.id} />
      </section>

      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="flex items-center gap-2">
          <Phone size={20} className="text-[#744722]" />
          <h2 className="text-lg font-bold text-[#4f321e]">Đang thuê</h2>
        </div>
        {activeContract ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info
              label="Tòa nhà"
              value={
                propertyDisplayAddress(activeContract.property)
              }
            />
            <Info label="Phòng" value={room?.room_code || "-"} />
            <Info
              label="Giá thuê"
              value={
                activeContract.monthly_price
                  ? `${Number(activeContract.monthly_price).toLocaleString("vi-VN")}đ`
                  : "-"
              }
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#80634a]">
            Hiện chưa có hợp đồng đang hiệu lực.
          </p>
        )}
      </section>

      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-[#744722]" />
            <h2 className="text-lg font-bold text-[#4f321e]">Lịch sử hợp đồng</h2>
          </div>
          <span className="rounded-full bg-[#ead3b3] px-2.5 py-1 text-xs font-semibold text-[#684324]">
            {contracts.length}
          </span>
        </div>

        {contracts.length === 0 ? (
          <p className="mt-4 text-sm text-[#80634a]">Chưa có hợp đồng.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="relative rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-4"
              >
                <div className="grid gap-2 text-sm sm:grid-cols-2">
  <div className="flex min-w-0 items-start justify-between gap-3 sm:col-span-2">
    <Info
      label="Bắt đầu"
      value={formatDate(contract.start_date)}
    />

    <div className="flex shrink-0 items-center gap-2">
      <span className="whitespace-nowrap text-xs font-medium text-[#684324]">
        Xem chi tiết HĐ:
      </span>

      <Link
        href={`/owner/contracts/${contract.id}`}
        aria-label="Xem chi tiết hợp đồng"
        title="Xem chi tiết hợp đồng"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#744722] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#633b1d] hover:shadow-md"
      >
        <KeyRound size={17} />
      </Link>
    </div>
  </div>

  <Info
    label="Kết thúc"
    value={formatDate(contract.end_date)}
  />

  <Info
    label="Tiền cọc"
    value={
      contract.deposit_amount
        ? `${Number(contract.deposit_amount).toLocaleString("vi-VN")}đ`
        : "-"
    }
  />

  <Info
    label="Trạng thái"
    value={contract.status || "-"}
  />

  <Info
    label="Phòng"
    value={contract.room?.room_code || "-"}
  />

  <Info
    label="Tòa nhà"
    value={propertyDisplayAddress(contract.property)}
  />
</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0">
      <span className="block text-xs text-[#8a6b50]">{label}</span>
      <strong className="mt-0.5 block break-words text-sm text-[#4d3422]">
        {value}
      </strong>
    </p>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("vi-VN");
}
