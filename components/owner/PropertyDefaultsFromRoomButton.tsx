"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiResponse } from "@/lib/api/client";

export default function PropertyDefaultsFromRoomButton({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function sync() {
    if (!window.confirm("Dùng chi phí và tiện ích của phòng được cập nhật gần nhất làm dữ liệu chung cho tòa nhà?")) return;
    setBusy(true);
    try {
      await readApiResponse(await fetch(`/api/owner/properties/${propertyId}/sync-room-defaults`, { method: "POST" }));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không thể đồng bộ dữ liệu tòa nhà");
    } finally {
      setBusy(false);
    }
  }

  return <button type="button" onClick={() => void sync()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2.5 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9] disabled:opacity-60"><RefreshCw size={16} className={busy ? "animate-spin" : ""} />{busy ? "Đang đồng bộ..." : "Lấy chi phí & tiện ích từ phòng mới nhất"}</button>;
}
