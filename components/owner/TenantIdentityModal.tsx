"use client";

import { useEffect } from "react";
import { ImageIcon, X } from "lucide-react";

type TenantIdentity = {
  id: string;
  full_name: string;
  cccd?: string | null;
  cccd_front_url?: string | null;
  cccd_back_url?: string | null;
};

export default function TenantIdentityModal({
  tenant,
  onClose,
}: {
  tenant: TenantIdentity;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2b1a10]/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`CCCD của ${tenant.full_name}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-[#d7b78f]/30 bg-[#fff9ef] shadow-[0_28px_80px_rgba(42,24,12,0.35)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#b58f69]/20 bg-[#fff9ef]/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
              Hồ sơ khách thuê
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-[#432918] sm:text-xl">
              {tenant.full_name}
            </h2>
            <p className="mt-1 text-sm text-[#80634a]">
              CCCD: {tenant.cccd || "Chưa cập nhật"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng ảnh CCCD"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#76573e] transition hover:bg-[#f1dfc8] hover:text-[#4d3020]"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <IdentityImage
            label="Mặt trước"
            url={tenant.cccd_front_url}
          />
          <IdentityImage
            label="Mặt sau"
            url={tenant.cccd_back_url}
          />
        </div>
      </section>
    </div>
  );
}

function IdentityImage({
  label,
  url,
}: {
  label: string;
  url?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#aa825d]/25 bg-[#f8ead7]">
      <div className="flex items-center justify-between gap-3 border-b border-[#aa825d]/20 px-4 py-3">
        <span className="text-sm font-bold text-[#5a3b25]">{label}</span>
        <ImageIcon size={17} className="text-[#8a6547]" />
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={`CCCD ${label.toLowerCase()}`}
            className="max-h-[55vh] min-h-48 w-full object-contain p-3 transition hover:opacity-90"
          />
        </a>
      ) : (
        <div className="grid min-h-48 place-items-center px-4 text-center text-sm text-[#80634a]">
          Chưa có ảnh {label.toLowerCase()}.
        </div>
      )}
    </div>
  );
}
