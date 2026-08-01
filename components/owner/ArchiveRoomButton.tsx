"use client";

import { EyeOff, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { readApiResponse } from "@/lib/api/client";

type DeleteMode = "archive" | "permanent";

export default function ArchiveRoomButton({
  roomId,
  propertyId,
}: {
  roomId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<DeleteMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!submitting && event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, submitting]);

  async function removeRoom(mode: DeleteMode) {
    setSubmitting(mode);
    setError(null);
    try {
      const query = mode === "permanent" ? "?mode=permanent" : "";
      await readApiResponse<unknown>(
        await fetch(`/api/owner/rooms/${roomId}${query}`, { method: "DELETE" }),
      );
      setOpen(false);
      router.push(`/owner/properties/${propertyId}`);
      router.refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : mode === "permanent"
            ? "Không thể xóa vĩnh viễn phòng"
            : "Không thể ẩn phòng",
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
      >
        <Trash2 size={16} />
        Xóa
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9998] grid place-items-center bg-[#2b1a10]/60 p-4 backdrop-blur-sm">
              <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Chọn cách xóa phòng" className="relative z-[9999] w-full max-w-md rounded-3xl border border-[#d6b993] bg-[#fff9ef] p-5 text-[#432918] shadow-[0_30px_90px_rgba(43,26,16,0.45)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">Xóa phòng</h2>
                    <p className="mt-1 text-sm text-[#80634a]">Chọn cách bạn muốn xử lý phòng này.</p>
                  </div>
                  <button type="button" aria-label="Đóng" disabled={Boolean(submitting)} onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#80634a] hover:bg-[#f1dfc8] disabled:opacity-50"><X size={18} /></button>
                </div>

                {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

                <div className="mt-5 space-y-3">
                  <button type="button" disabled={Boolean(submitting)} onClick={() => void removeRoom("permanent")} className="flex w-full items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-left transition hover:bg-red-100 disabled:opacity-60">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-white"><Trash2 size={18} /></span>
                    <span><strong className="block text-sm text-red-800">{submitting === "permanent" ? "Đang xóa vĩnh viễn..." : "Xóa vĩnh viễn phòng"}</strong><span className="mt-1 block text-xs leading-5 text-red-700/75">Xóa phòng cùng dữ liệu vận hành liên quan. Thao tác này không thể hoàn tác.</span></span>
                  </button>

                  <button type="button" disabled={Boolean(submitting)} onClick={() => void removeRoom("archive")} className="flex w-full items-start gap-3 rounded-2xl border border-[#dbc4a6] bg-[#f8ead7] p-4 text-left transition hover:bg-[#f1dfc8] disabled:opacity-60">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#744722] text-white"><EyeOff size={18} /></span>
                    <span><strong className="block text-sm text-[#5a351d]">{submitting === "archive" ? "Đang chuyển..." : "Chuyển vào thùng rác"}</strong><span className="mt-1 block text-xs leading-5 text-[#80634a]">Phòng bị ẩn công khai, hợp đồng và khách cũ vẫn được giữ. Có thể khôi phục trong 20 ngày.</span></span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
