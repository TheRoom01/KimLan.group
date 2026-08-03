"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type CopyCandidate = { id: string; room_code?: string | null; room_type?: string | null; price?: number | null };

export default function OwnerCopyRoomButton({
  propertyId,
  sourceRoomId,
  className = "",
}: {
  propertyId: string;
  sourceRoomId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<CopyCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function copy(roomId: string) {
    router.push(`/owner/rooms/create?property_id=${propertyId}&copy_from=${roomId}`);
  }

  async function handleClick() {
    if (sourceRoomId) return copy(sourceRoomId);
    setOpen(true);
    if (rooms.length) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/owner/properties/${propertyId}/rooms`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "Không thể tải danh sách phòng");
      setRooms(Array.isArray(payload?.data) ? payload.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải danh sách phòng");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className}>
        <Copy size={16} /> Copy phòng
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 p-4"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl bg-[#fff9ef] shadow-2xl" role="dialog" aria-modal="true">
            <header className="flex items-center justify-between border-b border-[#956b45]/20 p-4">
              <div><h2 className="font-bold text-[#432918]">Chọn phòng muốn sao chép</h2><p className="text-xs text-[#80634a]">Hợp đồng và khách thuê sẽ không được sao chép.</p></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-[#f3e1c9]">Đóng</button>
            </header>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {loading ? <p>Đang tải...</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              {!loading && !error && !rooms.length ? <p className="text-sm text-[#80634a]">Tòa nhà chưa có phòng để sao chép.</p> : null}
              {rooms.map((room) => (
                <button key={room.id} type="button" onClick={() => copy(room.id)} className="flex w-full items-center justify-between rounded-xl border border-[#956b45]/20 bg-white p-3 text-left hover:bg-[#f8ead7]">
                  <span><strong>{room.room_code || "Chưa có mã"}</strong><small className="ml-2 text-[#80634a]">{room.room_type || "Chưa phân loại"}</small></span>
                  <span className="text-sm font-semibold text-[#744722]">{Number(room.price || 0).toLocaleString("vi-VN")}đ</span>
                </button>
              ))}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
