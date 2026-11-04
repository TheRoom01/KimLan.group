"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AdminNotificationCenter from "@/components/admin/AdminNotificationCenter";

export default function HeaderNotifications({ signedIn, adminLevel }: { signedIn: boolean; adminLevel: 0 | 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (signedIn && (adminLevel === 1 || adminLevel === 2)) return <AdminNotificationCenter />;

  return (
    <div ref={root} className="home-notifications relative shrink-0">
      <button type="button" aria-label="Thông báo" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c9a46a]/45 bg-[#fffaf2] text-[#684324] shadow-sm hover:bg-[#f6ead7] focus-visible:outline-2 focus-visible:outline-offset-2">
        <Bell size={18} />
      </button>
      {open ? <section aria-label="Thông báo" className="fixed inset-x-3 top-[76px] z-[300] whitespace-normal rounded-2xl border border-[#c9a46a]/40 bg-[#fffaf2] p-4 text-sm text-[#432918] shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[280px]">
        <h2 className="font-bold">Thông báo</h2>
        <p className="mt-2">{signedIn ? "Thông báo chưa khả dụng cho tài khoản này." : "Đăng nhập để xem thông báo của bạn."}</p>
        {!signedIn ? <button type="button" className="mt-3 rounded-lg bg-[#80542f] px-3 py-2 font-semibold text-white"
          onClick={() => { setOpen(false); document.querySelector<HTMLButtonElement>("#auth-anchor button")?.click(); }}>Đăng nhập ngay</button> : null}
      </section> : null}
    </div>
  );
}
