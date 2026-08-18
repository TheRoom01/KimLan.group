import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import DepositContractBoard from "@/components/owner/DepositContractBoard";
import { getOwnerDeposits } from "@/lib/owner/getOwnerDeposits";

export default async function DepositsPage() {
  const deposits = await getOwnerDeposits();
  return <div className="min-w-0 space-y-5 sm:space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]"><HandCoins size={15} />Quản lý hợp đồng</p><h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">Đặt cọc giữ phòng</h1><p className="mt-1 text-sm text-[#7f6651]">Theo dõi tiền cọc và lịch check-in của khách.</p></div><Link href="/owner/rooms" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-bold text-white"><Plus size={17} /> Đặt cọc giữ phòng</Link></div>
    <div className="flex gap-2"><Link href="/owner/contracts" className="rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] px-4 py-2 text-sm font-bold text-[#74583e]">Hợp đồng thuê</Link><span className="rounded-xl bg-[#744722] px-4 py-2 text-sm font-bold text-white">Đặt cọc</span></div>
    <DepositContractBoard deposits={deposits} />
  </div>;
}
