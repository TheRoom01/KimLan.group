"use client";

import { Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useState } from "react";

import { readApiResponse } from "@/lib/api/client";

export default function DeleteRoomCardButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeRoom() {
    setLoading(true);
    setError(null);
    try {
      await readApiResponse(await fetch(`/api/owner/rooms/${roomId}`, { method: "DELETE" }));
      setOpen(false);
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Không thể xóa phòng");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-red-700 shadow-md transition hover:bg-red-50" aria-label="Xóa phòng">
        <Trash2 size={17} />
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[500] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Xác nhận xóa phòng" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setOpen(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-[#fff9ef] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-[#4d3422]">Xóa phòng?</h2><p className="mt-2 text-sm leading-6 text-[#80634a]">Phòng sẽ bị ẩn khỏi danh sách và trang công khai. Media cùng lịch sử hợp đồng vẫn được giữ để đảm bảo an toàn dữ liệu.</p></div>
              <button type="button" onClick={() => setOpen(false)} disabled={loading} className="text-[#80634a]" aria-label="Đóng"><X size={20} /></button>
            </div>
            {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={loading} className="rounded-xl border px-4 py-2 text-sm font-semibold">Hủy</button>
              <button type="button" onClick={() => void removeRoom()} disabled={loading} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Đang xóa..." : "Xác nhận xóa"}</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
