"use client";

import React, { useState } from "react";
import CompanyIntroModal from "@/components/CompanyIntroModal";

type Props = {
  logoSrc?: string;
};

export default function LogoIntroButton({ logoSrc = "/logo.png" }: Props) {
  const [open, setOpen] = useState(false);

  return (
  <>
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center justify-center"
      aria-label="Mở giới thiệu công ty"
    >
      <div className="flex flex-col items-center">
     {/* Cụm thương hiệu: LOGO */}
      <img
        src={logoSrc}
        alt="Logo"
        className="h-14 w-14 object-contain rounded-lg"
       />
        <span className="mt-1 text-[11px] font-semibold text-white bg-black/50 px-2 py-0.5 rounded-full">
      👆
  Liên hệ Admin
</span>

      </div>
    </button>

    <CompanyIntroModal open={open} onClose={() => setOpen(false)} />
  </>
);

}
