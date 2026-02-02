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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2147483646]">
      <button
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-[560px] rounded-t-2xl bg-white p-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-black/15" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">The Room team</div>
            <div className="mt-1 space-y-1 text-sm text-black/75">
              <div>Cho thuê căn hộ dịch vụ - Phòng trọ - Chung cư</div>
              <div>Studio / 1 phòng ngủ / 2 phòng ngủ /3 phòng ngủ / Duplex,...</div>
              <div>Hotline: 0967 467 587 - 0772 339 345</div>
              <div>Địa chỉ: 14/5A5 Kỳ Đồng, Quận 3</div>
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
            className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
          >
            Tiktok
          </a>
          <a
            href="https://www.facebook.com/duongkimlan001"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
          >
            Facebook
          </a>
          <a
            href="https://zalo.me/0772339345"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border bg-white px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
          >
            Zalo
          </a>
        </div>
      </div>
    </div>
  );
}
