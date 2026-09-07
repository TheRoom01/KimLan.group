"use client";

import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { useState } from "react";

type BuildingCard = {
  id: string;
  href: string;
  image: string | null;
  name: string;
  title: string;
  address: string;
  roomCount: number;
  availableCount: number;
  upcomingCount: number;
};

export default function SalesBuildingGrid({ buildings }: { buildings: BuildingCard[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  return <>
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {buildings.map((building) => {
        const opening = openingId === building.id;
        return <Link
          key={building.id}
          href={building.href}
          aria-label={`Xem phòng tại ${building.title}`}
          aria-busy={opening}
          onClick={() => setOpeningId(building.id)}
          className={`group relative overflow-hidden rounded-2xl border bg-white shadow-[0_8px_24px_rgba(92,61,34,0.06)] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#744722] focus-visible:ring-offset-2 ${opening ? "pointer-events-none -translate-y-1 border-[#b88b62] shadow-[0_18px_42px_rgba(92,61,34,0.18)]" : "border-[#e8d9cb] hover:-translate-y-1.5 hover:border-[#c9a581] hover:shadow-[0_18px_42px_rgba(92,61,34,0.16)]"}`}
        >
          <div className="relative h-[152px] overflow-hidden bg-[#eadfd3]">
            {building.image
              ? <img src={building.image} alt={building.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
              : <div className="grid h-full place-items-center text-[#9a7758]"><Building2 size={48} className="transition-transform duration-300 group-hover:scale-110" /></div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent transition-colors duration-300 group-hover:from-black/75" />
            <h2 className="absolute inset-x-4 bottom-4 text-lg font-bold text-white">{building.title}</h2>
          </div>
          <div className="p-4">
            <p className="min-h-12 text-sm leading-6 text-[#80634a]">{building.address}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span><strong>{building.roomCount}</strong> phòng</span>
              <span><strong>{building.availableCount}</strong> trống hôm nay</span>
              <span><strong>{building.upcomingCount}</strong> sắp trống</span>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-[#e7f2eb] px-3 py-1 text-xs font-bold text-[#386658] transition-all duration-300 group-hover:bg-[#386658] group-hover:text-white">
              {opening ? "Đang mở..." : "Xem phòng trống"}
              <ChevronRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 transition group-hover:ring-white/50" />
        </Link>;
      })}
    </div>
    {openingId ? <SalesBuildingLoadingSkeleton overlay /> : null}
  </>;
}

export function SalesBuildingLoadingSkeleton({ overlay = false }: { overlay?: boolean }) {
  return <div
    role="status"
    aria-live="polite"
    aria-label="Đang mở tòa nhà"
    className={overlay ? "fixed inset-0 z-[200] overflow-y-auto bg-[#fffaf6]/95 backdrop-blur-[2px]" : "min-h-screen bg-[#fffaf6]"}
  >
    <div className="mx-auto max-w-[1112px] px-4 py-8 sm:px-8">
      <div className="h-3 w-20 animate-pulse rounded-full bg-[#d7c1aa]" />
      <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-xl bg-[#d7c1aa]" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-lg bg-[#eadbca]" />
      <div className="mt-8 overflow-hidden rounded-3xl border border-[#e4d3c1] bg-white shadow-sm">
        <div className="h-56 animate-pulse bg-[#ddcbb8] sm:h-72" />
        <div className="space-y-4 p-6">
          <div className="h-7 w-52 animate-pulse rounded-lg bg-[#dfcdbb]" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-[#eee2d5]" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-[#eee2d5]" />
          <div className="flex gap-3 pt-3">
            <div className="h-14 w-24 animate-pulse rounded-2xl bg-[#e4d2bf]" />
            <div className="h-14 w-24 animate-pulse rounded-2xl bg-[#e4d2bf]" />
            <div className="h-14 w-24 animate-pulse rounded-2xl bg-[#e4d2bf]" />
          </div>
        </div>
      </div>
      <span className="sr-only">Đang tải thông tin và danh sách phòng của tòa nhà.</span>
    </div>
  </div>;
}
