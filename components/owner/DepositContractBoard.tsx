"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { OwnerDeposit } from "@/lib/owner/getOwnerDeposits";

const filters = [
  ["all", "Tất cả"], ["holding", "Đang giữ"], ["awaiting_checkin", "Chờ check-in"],
  ["checked_in", "Đã check-in"], ["cancelled", "Hủy"],
] as const;

const statusMeta = {
  holding: ["Đang giữ", "bg-amber-100 text-amber-800", "bg-amber-400"],
  awaiting_checkin: ["Chờ check-in", "bg-blue-100 text-blue-800", "bg-blue-500"],
  checked_in: ["Đã check-in", "bg-emerald-100 text-emerald-800", "bg-emerald-500"],
  cancelled: ["Hủy", "bg-gray-200 text-gray-600", "bg-gray-400"],
} as const;

export default function DepositContractBoard({ deposits }: { deposits: OwnerDeposit[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return deposits.filter((item) => {
      if (filter !== "all" && item.booking_status !== filter) return false;
      if (!needle) return true;
      return [item.tenant?.full_name, item.tenant?.phone, item.room?.room_code, item.property?.name, item.property?.code, item.property?.house_number, item.property?.address]
        .some((value) => String(value ?? "").toLocaleLowerCase("vi").includes(needle));
    });
  }, [deposits, filter, query]);

  return <div className="space-y-4">
    <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b6b50]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm SĐT khách / Địa chỉ phòng..." className="h-12 w-full rounded-2xl border border-[#aa825d]/30 bg-[#fffdf8] pl-11 pr-4 text-sm text-[#4d3422] outline-none focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10" /></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{filters.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${filter === value ? "bg-[#744722] text-white" : "border border-[#aa825d]/25 bg-[#fff9ef] text-[#74583e]"}`}>{label}</button>)}</div>
    {visible.length === 0 ? <div className="rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center text-sm text-[#80634a]">Không có đặt cọc phù hợp.</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => {
      const meta = statusMeta[item.booking_status] ?? statusMeta.holding;
      const paid = Number(item.deposit_amount ?? 0); const total = Number(item.booking_total_amount ?? 0);
      return <Link href={`/owner/contracts/${item.id}`} key={item.id} className="block rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-[0_14px_35px_rgba(92,61,34,0.08)] transition hover:-translate-y-0.5 hover:shadow-lg">
        <h2 className="text-lg font-black text-[#432918]">P.{item.room?.room_code || "-"}</h2>
        <p className="mt-1 text-sm font-semibold text-[#5f432e]">{item.tenant?.full_name || "Chưa có tên"} · {maskPhone(item.tenant?.phone)}</p>
        <p className="mt-2 text-sm text-[#80634a]">Check-in {formatDate(item.start_date)}</p>
        <p className="mt-1 text-xs font-semibold text-[#987456]">{item.property?.name || item.property?.code || item.property?.address || "Chưa có tòa nhà"}</p>
        <div className="mt-4 grid grid-cols-2 border-y border-[#aa825d]/20 py-3"><Money label="Cọc" value={paid} /><Money label="Còn thiếu" value={Math.max(0, total - paid)} /></div>
        <span className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${meta[1]}`}><span className={`h-2.5 w-2.5 rounded-full ${meta[2]}`} />{meta[0]}</span>
      </Link>;
    })}</div>}
  </div>;
}

function Money({ label, value }: { label: string; value: number }) { return <div><p className="text-xs font-semibold text-[#8b6b50]">{label}</p><p className="mt-1 text-base font-black text-[#4d3422]">{value.toLocaleString("vi-VN")}</p></div>; }
function formatDate(value: string) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }); }
function maskPhone(value?: string | null) { if (!value) return "Chưa có SĐT"; const clean = value.trim(); return clean.length > 6 ? `${clean.slice(0, 4)}***${clean.slice(-2)}` : clean; }
