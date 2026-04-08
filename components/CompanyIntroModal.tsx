"use client";

import React, { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CompanyIntroModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleOpenZalo = () => {
  const phone = "0967467587";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // Ưu tiên mở app Zalo
    window.location.href = `zalo://conversation?phone=${phone}`;

    // Fallback nếu app không mở được
    window.setTimeout(() => {
      window.open(`https://zalo.me/${phone}`, "_blank", "noopener,noreferrer");
    }, 800);

    return;
  }

  // Desktop: mở web
  window.open(`https://zalo.me/${phone}`, "_blank", "noopener,noreferrer");
};
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center p-4">
      <button
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div className="relative z-10 w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
      
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">The Room </div>
            <div className="mt-1 space-y-1 text-sm text-black">
              <div>Cho thuê căn hộ dịch vụ - Phòng trọ - Chung cư</div>
              <div>Studio / 1 phòng ngủ / 2 phòng ngủ /3 phòng ngủ / Duplex,...</div>
              <div>📲 Hotline: 0967 467 587 - 0772 339 345</div>

              {/* Tuyển dụng */}
              <div className="mt-2 text-[15px] font-bold text-red-600 animate-pulse">
               Tuyển Dụng: Cần tuyển thêm 1000 CTV / Sales chuyên Tìm kiếm - Tư vấn - Dẫn Khách đi xem căn hộ
              </div>
              <div className="text-[14px] font-semibold text-black">
                🌹 Hoa Hồng siêu cao - Được hướng dẫn tận tình
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium bg-black/5 hover:bg-black/10"
          >
            Đóng
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <a
            href="https://www.tiktok.com/@kimlangroup.chdv?_r=1&_t=ZS-93alZMGvdFQ"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-gray-100 active:scale-[0.98] transition"
          >
            Tiktok
          </a>
          <a
            href="https://www.facebook.com/share/1Ds8LBYXRF/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-gray-100 active:scale-[0.98] transition"
          >
            Facebook
          </a>
         <button
          type="button"
          onClick={handleOpenZalo}
          className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-gray-100 active:scale-[0.98] transition"
        >
         Zalo
        </button>
        </div>
      </div>
    </div>
  );
}
