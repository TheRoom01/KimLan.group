"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiResponse } from "@/lib/api/client";

const options = [["holding", "Đang giữ"], ["awaiting_checkin", "Chờ check-in"], ["checked_in", "Đã check-in"], ["cancelled", "Hủy"]] as const;

export default function DepositStatusActions({ contractId, currentStatus }: { contractId: string; currentStatus?: string | null }) {
  const router = useRouter(); const [loading, setLoading] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function update(status: string) { setLoading(status); setError(null); try { await readApiResponse(await fetch(`/api/owner/deposits/${contractId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_status: status }) })); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể đổi trạng thái"); } finally { setLoading(null); } }
  return <div className="rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-4"><p className="text-sm font-bold text-[#4d3422]">Trạng thái đặt cọc</p><div className="mt-3 flex flex-wrap gap-2">{options.map(([value, label]) => <button key={value} type="button" disabled={Boolean(loading) || value === currentStatus} onClick={() => void update(value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${value === currentStatus ? "bg-[#744722] text-white" : "border border-[#aa825d]/30 bg-white text-[#684324] disabled:opacity-60"}`}>{loading === value ? "Đang lưu..." : label}</button>)}</div>{error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}</div>;
}
