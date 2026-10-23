"use client";

import React, { useState } from "react";
import Image from "next/image";
import CompanyIntroModal from "@/components/CompanyIntroModal";

type Props = {
  logoSrc?: string;
};

export default function LogoIntroButton({ logoSrc = "/logo-ui.webp" }: Props) {
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
      <Image
        src={logoSrc}
        alt="Logo"
        width={56}
        height={56}
        className="h-14 w-14 object-contain rounded-lg"
       />

      </div>
    </button>

    <CompanyIntroModal open={open} onClose={() => setOpen(false)} />
  </>
);

}
