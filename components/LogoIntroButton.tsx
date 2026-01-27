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
        <span className="mt-1 text-[12px] text-black/00 drop-shadow-sm">
        Xem thông tin
        </span>

      </div>
    </button>

    <CompanyIntroModal open={open} onClose={() => setOpen(false)} />
  </>
);

}
