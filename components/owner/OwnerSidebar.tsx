"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  Home,
  KeyRound,
  Users,
  Warehouse,
} from "lucide-react";
import OwnerAccountPanel from "@/components/owner/OwnerAccountPanel";
import OwnerNotificationCenter from "@/components/owner/OwnerNotificationCenter";
import OwnerBuildingSearch from "@/components/owner/OwnerBuildingSearch";

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

function isMenuActive(
  pathname: string | null,
  href: string,
) {
  if (!pathname) return href === "/owner";

  return (
    pathname === href ||
    (href !== "/owner" &&
      pathname.startsWith(`${href}/`))
  );
}

export default function OwnerSidebar() {
  const pathname = usePathname();

  return (
    <>
      <header
        className="
          sticky
          top-0
          z-[100]
          border-b
          border-[#6f4526]/30
          bg-[#704522]
          text-[#fff6e8]
          shadow-[0_8px_30px_rgba(83,48,22,0.18)]
        "
      >
        <div
          className="
            mx-auto
            flex
            h-16
            min-w-0
            max-w-[1440px]
            items-center
            gap-3
            px-4
            sm:px-6
            lg:h-[72px]
            lg:px-8
          "
        >
          <Link
            href="/owner"
            className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-2 font-semibold tracking-tight"
          >
            <span className="grid h-10 w-10 place-items-center overflow-hidden">
              <img
                src="/logo.png"
                alt="The Room"
                className="h-10 w-10 object-contain"
              />
            </span>

            <span className="hidden text-lg font-semibold text-[#fff6e8] xl:inline xl:text-xl">
              Landlord
            </span>
          </Link>


          <nav className="ml-4 hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {menus.map((item) => {
              const active = isMenuActive(
                pathname,
                item.href,
              );

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


          <div className="ml-auto flex min-w-0 flex-1 items-center gap-1.5 lg:ml-0 lg:flex-none lg:gap-2">
            <OwnerBuildingSearch />

            <OwnerNotificationCenter />
          </div>


          {/* Giữ nguyên vị trí để có nút mở panel */}
          <OwnerAccountPanel />

        </div>
      </header>


      {/* Mobile bottom navigation */}
      <nav
        className="
          fixed
          inset-x-0
          bottom-0
          z-40
          border-t
          border-[#8a5b35]/20
          bg-[#fff9ef]/95
          px-2
          pb-[max(0.5rem,env(safe-area-inset-bottom))]
          pt-2
          shadow-[0_-12px_35px_rgba(74,45,23,0.12)]
          backdrop-blur-xl
          lg:hidden
        "
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {menus.map((item) => {
            const active = isMenuActive(
              pathname,
              item.href,
            );

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
                <Icon
                  size={19}
                  strokeWidth={
                    active ? 2.4 : 2
                  }
                />

                <span className="max-w-full truncate">
                  {item.shortTitle}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
