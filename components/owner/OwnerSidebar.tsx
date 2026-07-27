"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileText,
  Home,
  KeyRound,
  Search,
  Users,
  Warehouse,
} from "lucide-react";

const menus = [
  {
    title: "Trang chủ",
    shortTitle: "Trang chủ",
    href: "/owner",
    icon: Home,
  },
  {
    title: "Tòa nhà",
    shortTitle: "Tòa nhà",
    href: "/owner/properties",
    icon: Building2,
  },
  {
    title: "Phòng",
    shortTitle: "Phòng",
    href: "/owner/rooms",
    icon: Warehouse,
  },
  {
    title: "Khách thuê",
    shortTitle: "Khách",
    href: "/owner/tenants",
    icon: Users,
  },
  {
    title: "Hợp đồng",
    shortTitle: "Hợp đồng",
    href: "/owner/contracts",
    icon: FileText,
  },
];

function isMenuActive(pathname: string | null, href: string) {
  if (!pathname) return href === "/owner";

  return (
    pathname === href ||
    (href !== "/owner" && pathname.startsWith(`${href}/`))
  );
}

export default function OwnerSidebar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#6f4526]/30 bg-[#704522] text-[#fff6e8] shadow-[0_8px_30px_rgba(83,48,22,0.18)]">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <Link
            href="/owner"
            className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-2 font-semibold tracking-tight"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f2d9b6] text-[#6a3f20] shadow-inner">
              <KeyRound size={19} strokeWidth={2.2} />
            </span>
            <span className="text-lg lg:text-xl">Landlord</span>
          </Link>

          <nav className="ml-4 hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {menus.map((item) => {
              const active = isMenuActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-[#f5dfc0] text-[#5b351b] shadow-sm"
                      : "text-[#f9ead5] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={17} />
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              href="/owner/rooms"
              className="flex min-w-[180px] items-center gap-2 rounded-xl border border-[#f3d9b4]/25 bg-[#5d361c]/45 px-3 py-2 text-sm text-[#f8e8d2] transition hover:bg-[#5d361c]/70 lg:min-w-[220px]"
            >
              <Search size={17} />
              <span className="truncate">Tìm phòng, tòa nhà...</span>
            </Link>

            <Link
              href="/owner/contracts"
              aria-label="Xem hợp đồng sắp hết hạn"
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#f3d9b4]/20 bg-white/5 transition hover:bg-white/10"
            >
              <Bell size={18} />
            </Link>

            <div className="hidden items-center gap-2 rounded-xl border border-[#f3d9b4]/20 bg-white/5 px-3 py-2 xl:flex">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-[#f2d9b6] text-xs font-bold text-[#633b20]">
                KL
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Kim Lân</p>
                <p className="text-[11px] text-[#e8cfad]">Owner Portal</p>
              </div>
            </div>
          </div>

          <Link
            href="/owner/contracts"
            aria-label="Xem hợp đồng"
            className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-[#f3d9b4]/20 bg-white/5 md:hidden"
          >
            <Bell size={18} />
          </Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#8a5b35]/20 bg-[#fff9ef]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_35px_rgba(74,45,23,0.12)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {menus.map((item) => {
            const active = isMenuActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition sm:text-xs ${
                  active
                    ? "bg-[#7b4b27] text-[#fff5e6]"
                    : "text-[#76573e] hover:bg-[#f1dfc8]"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate">{item.shortTitle}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
