"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CompanyIntroModal({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
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
      window.location.href = `zalo://conversation?phone=${phone}`;

      window.setTimeout(() => {
        window.open(`https://zalo.me/${phone}`, "_blank", "noopener,noreferrer");
      }, 800);

      return;
    }

    window.open(`https://zalo.me/${phone}`, "_blank", "noopener,noreferrer");
  };
  
if (!open || !mounted) return null;

const linkClass =
    "rounded-2xl border border-white/30 bg-[linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-3 py-2 text-center text-sm font-semibold text-white/90 backdrop-blur-[28px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:bg-white/10 hover:text-white active:scale-[0.98]";

 return createPortal(
  <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 isolate">
      <button
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[8px]"
      />

      <div className="relative z-[2147483647] w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-3xl border border-white/40 bg-[linear-gradient(rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-4 text-white backdrop-blur-[48px] shadow-[0_45px_140px_rgba(0,0,0,0.85),0_0_60px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.5)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">The Room</div>

            <div className="mt-1 space-y-1 text-sm text-white/85">
              <div>Cho thuê căn hộ dịch vụ - Phòng trọ - Chung cư</div>
              <div>Studio / 1 phòng ngủ / 2 phòng ngủ / 3 phòng ngủ / Duplex,...</div>
              <div>📲 Hotline: 0967 467 587 - 0772 339 345</div>

              <div className="mt-2 text-[15px] font-bold text-[#ff8b8b] animate-pulse">
                Tuyển Dụng: Cần tuyển thêm 1000 CTV / Sales chuyên Tìm kiếm - Tư vấn - Dẫn Khách đi xem căn hộ
              </div>

              <div className="text-[14px] font-semibold text-white">
                🌹 Hoa Hồng siêu cao - Được hướng dẫn tận tình
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white/85 backdrop-blur-[24px] hover:bg-white/15 hover:text-white"
          >
            Đóng
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <a
            href="https://www.tiktok.com/@kimlangroup.chdv?_r=1&_t=ZS-93alZMGvdFQ"
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            Tiktok
          </a>

          <a
            href="https://www.facebook.com/share/1Ds8LBYXRF/"
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            Facebook
          </a>

          <button type="button" onClick={handleOpenZalo} className={linkClass}>
            Zalo
          </button>
        </div>
      </div>
     </div>,
    document.body
  );
}