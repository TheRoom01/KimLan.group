"use client";

import { Check, Filter, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type PropertyOccupancyFilter = "empty" | "full";

const OPTIONS: Array<{
  value: PropertyOccupancyFilter;
  label: string;
  description: string;
}> = [
  {
    value: "empty",
    label: "Có phòng trống",
    description: "Tòa nhà đang có ít nhất một phòng trống",
  },
  {
    value: "full",
    label: "Đã full phòng",
    description: "Tòa nhà có phòng và hiện không còn phòng trống",
  },
];

export default function PropertyListToolbar({
  initialSearch,
  activeFilter,
}: {
  initialSearch: string;
  activeFilter: PropertyOccupancyFilter | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search === initialSearch) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const value = search.trim();
      if (value) params.set("building_search", value);
      else params.delete("building_search");
      startTransition(() => router.replace(`/owner/properties?${params.toString()}`, { scroll: false }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [initialSearch, router, search, searchParams]);

  useEffect(() => {
    if (!mobileFilterOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !modalRef.current?.contains(event.target)) {
        setMobileFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFilterOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileFilterOpen]);

  const selectFilter = (value: PropertyOccupancyFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeFilter === value) params.delete("occupancy");
    else params.set("occupancy", value);
    setMobileFilterOpen(false);
    startTransition(() => router.replace(`/owner/properties?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[#d7bea0]/45 bg-[#fffaf1]/75 p-2.5 shadow-[0_8px_24px_rgba(91,57,31,0.05)] backdrop-blur-md md:flex-row md:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Tìm theo đầy đủ địa chỉ tòa nhà</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d725c]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm full địa chỉ tòa nhà..."
          className="h-11 w-full rounded-xl border border-[#dec9ad] bg-white/90 pl-9 pr-10 text-sm text-[#432918] outline-none transition placeholder:text-[#a28c78] focus:border-[#9b6840] focus:ring-2 focus:ring-[#d9b993]/40 md:h-10"
        />
        {search ? (
          <button
            type="button"
            aria-label="Xóa nội dung tìm kiếm"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#806650] hover:bg-[#f1e2cf]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {isPending ? <span className="absolute bottom-0 left-3 right-3 h-0.5 animate-pulse rounded-full bg-[#9b6840]" /> : null}
      </label>

      <div className="hidden shrink-0 gap-2 md:flex">
        {OPTIONS.map((option) => (
          <FilterButton
            key={option.value}
            active={activeFilter === option.value}
            label={option.label}
            onClick={() => selectFilter(option.value)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-expanded={mobileFilterOpen}
        aria-label="Lọc tòa nhà theo tình trạng phòng"
        onClick={() => setMobileFilterOpen(true)}
        className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold md:hidden ${
          activeFilter
            ? "border-[#744722] bg-[#744722] text-white"
            : "border-[#dec9ad] bg-white/90 text-[#68482f]"
        }`}
      >
        <Filter className="h-4 w-4" />
        {activeFilter === "empty" ? "Có phòng trống" : activeFilter === "full" ? "Đã full phòng" : "Bộ lọc"}
      </button>

      {mobileFilterOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-[#2b1a10]/55 p-3 pt-16 backdrop-blur-[4px] md:hidden">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Lọc danh sách tòa nhà" className="max-h-[72vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/35 bg-[linear-gradient(rgba(255,255,255,0.12),rgba(255,255,255,0.05))] p-2 text-white backdrop-blur-[45px] shadow-[0_35px_120px_rgba(0,0,0,0.75),0_0_50px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.45)]">
            <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
              <div>
                <p className="text-base font-bold text-white">Lọc tòa nhà</p>
                <p className="mt-1 text-xs text-white/60">Bấm lại lựa chọn đang bật để xem tất cả.</p>
              </div>
              <button type="button" aria-label="Đóng bộ lọc" onClick={() => setMobileFilterOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 pb-1">
              {OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectFilter(option.value)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    activeFilter === option.value
                      ? "bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                      : "bg-white/5 text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">{option.label}</strong><span className="mt-1 block text-xs text-white/55">{option.description}</span></span>
                  {activeFilter === option.value ? <Check className="h-5 w-5 shrink-0 text-emerald-200" /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 min-w-36 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
        active
          ? "border-[#744722] bg-[#744722] text-white shadow-sm"
          : "border-[#dec9ad] bg-white text-[#68482f] hover:bg-[#f7ead6]"
      }`}
    >
      {active ? <Check className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
      {label}
    </button>
  );
}
