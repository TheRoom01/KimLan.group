"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

export default function ContractExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/exports/contracts", { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể xuất danh sách hợp đồng.");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const fallbackName = `Hop_dong_thue_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const filename = encodedName ? decodeURIComponent(encodedName) : fallbackName;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xuất danh sách hợp đồng.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex flex-col items-end gap-1">
    <button type="button" onClick={() => void download()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 text-sm font-semibold text-[#684324] transition hover:bg-[#f3e1c9] disabled:cursor-wait disabled:opacity-60">
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      {loading ? "Đang tạo file..." : "Xuất file"}
    </button>
    {error ? <p role="alert" className="max-w-64 text-right text-xs font-semibold text-red-700">{error}</p> : null}
  </div>;
}
