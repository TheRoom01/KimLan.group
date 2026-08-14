"use client";

import { Download } from "lucide-react";

export default function OwnerExportButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 text-sm font-semibold text-[#684324] transition hover:bg-[#f3e1c9]"
    >
      <Download size={16} />
      {label}
    </a>
  );
}
