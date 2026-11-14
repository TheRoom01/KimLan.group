"use client";

import React, { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { AppWindow, CalendarCheck, CalendarClock, Cat, Dog, Globe2, LayoutGrid, Search, createLucideIcon, type LucideIcon } from "lucide-react";
import FilterChoicePanel, { AMENITIES_MODAL_QUERY } from "@/components/FilterChoicePanel";
import { roomFeatureOptions, tenantRoomFeatureOptions, type RoomFeature } from "@/lib/rooms/features";

import type { SortMode } from "@/lib/rooms/listFilters";
export type { SortMode } from "@/lib/rooms/listFilters";
type RoomStatusFilter = "Đang trống" | "Sắp trống" | "Đã thuê";
const ROOM_STATUS_SEPARATOR = ",";

const Stairs = createLucideIcon("Stairs", [["path", { d: "M3 21h5v-5h5v-5h5V6h3", key: "steps" }]]);
const Elevator = createLucideIcon("Elevator", [
  ["rect", { x: "4", y: "8", width: "16", height: "13", rx: "1", key: "doors" }],
  ["path", { d: "M12 8v13M7 5l2-2 2 2m2-2 2 2 2-2", key: "arrows" }],
]);
const Balcony = createLucideIcon("Balcony", [["path", { d: "M8 12V7a4 4 0 0 1 8 0v5M3 12h18v8H3zM8 12v8m4-8v8m4-8v8", key: "rail" }]]);
const NoPets = createLucideIcon("NoPets", [
  ["path", { d: "M6 13a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm5-7a1.5 2 0 1 0-3 0 1.5 2 0 0 0 3 0Zm7 0a1.5 2 0 1 0-3 0 1.5 2 0 0 0 3 0Zm3 6a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM7 17c0-2 2-2 3-4s3-2 4 0 3 2 3 4-2 3-5 2-5 0-5-2ZM3 3l18 18", key: "paw" }],
]);
const featureIcons = {
  balcony: Balcony, window: AppWindow, accepts_foreign_tenants: Globe2,
};
type FeatureOption<Value extends keyof typeof featureIcons> =
  Extract<(typeof roomFeatureOptions)[number], { value: Value }>;

function AmenityGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="room-amenities-group">
    <h4 className="text-sm font-semibold text-[#FFE7BE]/75">{title}</h4>
    <div className="room-amenities-options">{children}</div>
  </section>;
}

function AmenityOption({ label, icon: Icon, checked, onChange, radio = false }: {
  label: string; icon: LucideIcon; checked: boolean; onChange: () => void; radio?: boolean;
}) {
  return <label className={optionClass(checked)}>
    <input type={radio ? "radio" : "checkbox"} name={radio ? "moveFilter" : undefined}
      checked={checked} className={radio ? radioClass : checkboxClass} onChange={onChange} />
    <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
    <span className="text-sm font-medium leading-tight">{label}</span>
  </label>;
}

type FilterBarProps = {
  districts: string[];
  roomTypes: string[];
  total?: number | null;
  priceApplied: [number, number];
  priceFilterActive: boolean;
  badgeFilterActive: boolean;

  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  onSearchSubmit?: () => void;

  priceDraft: [number, number];
  setPriceDraft: React.Dispatch<React.SetStateAction<[number, number]>>;
  setPriceApplied: React.Dispatch<React.SetStateAction<[number, number]>>;

  selectedDistricts: string[];
  setSelectedDistricts: React.Dispatch<React.SetStateAction<string[]>>;
  selectedRoomTypes: string[];
  setSelectedRoomTypes: React.Dispatch<React.SetStateAction<string[]>>;

   moveFilter: "elevator" | "stairs" | null;
  setMoveFilter: React.Dispatch<React.SetStateAction<"elevator" | "stairs" | null>>;

  petFilters: ("cat" | "dog" | "nopet")[];
  setPetFilters: React.Dispatch<React.SetStateAction<("cat" | "dog" | "nopet")[]>>;

  termFilters: ("short" | "long")[];
  setTermFilters: React.Dispatch<React.SetStateAction<("short" | "long")[]>>;

  sortMode: SortMode;
  canFilterHidden?: boolean;
  setSortMode: React.Dispatch<React.SetStateAction<SortMode>>;

  statusFilter: string | null;
  setStatusFilter: React.Dispatch<React.SetStateAction<string | null>>;

  loading?: boolean;
  featureFilters: RoomFeature[];
  setFeatureFilters: React.Dispatch<React.SetStateAction<RoomFeature[]>>;
};

const PRICE_MIN = 3_000_000;
const PRICE_MAX = 30_000_000;
const PRICE_STEP = 1_000_000;

const pillBtnBase =
  "min-h-[30px] rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.06)] px-[9px] py-[5px] text-[9.5px] tracking-wide font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] backdrop-blur-[28px] shadow-[0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.1)] hover:border-white/40 sm:px-[10px] sm:text-[10.5px] flex items-center justify-center gap-1";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const floorPrice = (v: number) => Math.floor(v / PRICE_STEP) * PRICE_STEP;
const ceilPrice = (v: number) => Math.ceil(v / PRICE_STEP) * PRICE_STEP;
const snap = (v: number) => Math.round(v / PRICE_STEP) * PRICE_STEP;
const parseMoneyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const optionClass = (checked: boolean) => `
  group flex cursor-pointer items-center gap-2
  rounded-xl px-2.5 py-1.5 text-[13px] transition-all
  ${
    checked
      ? "bg-[rgba(216,180,135,0.22)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
      : "text-white/90 hover:bg-[rgba(216,180,135,0.14)] hover:text-white"
  }
`;

const checkboxClass = `
  h-4 w-4 rounded-[5px]
  border border-white/40
  bg-white/5
  accent-[#D8B487]
`;

const radioClass = `
  h-4 w-4
  accent-[#D8B487]
`;

const formatMoneyInput = (n: number) => n.toLocaleString("vi-VN");
const floorMillion = (v: number) => Math.floor(v / 1000000) * 1000000;
const ceilMillion = (v: number) => Math.ceil(v / 1000000) * 1000000;

const FilterBar = ({
  districts,
  roomTypes,
  search,
  setSearch,
  onSearchSubmit,
  priceDraft,
  priceApplied,
  priceFilterActive,
  badgeFilterActive,
  setPriceDraft,
  setPriceApplied,
  selectedDistricts,
  setSelectedDistricts,
  selectedRoomTypes,
  setSelectedRoomTypes,
  moveFilter,
  setMoveFilter,
  petFilters,
  setPetFilters,
  termFilters,
  setTermFilters,
  sortMode,
  canFilterHidden = false,
  setSortMode,
  statusFilter,
  setStatusFilter,
  loading = false,
  featureFilters,
  setFeatureFilters,
}: FilterBarProps) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const [openFilter, setOpenFilter] = useState<"district" | "roomType" | "amenities" | "sort" | null>(null);
 const [minInput, setMinInput] = useState(formatMoneyInput(priceDraft[0]));
const [maxInput, setMaxInput] = useState(formatMoneyInput(priceDraft[1]));
const [isMobileViewport, setIsMobileViewport] = useState(false);
const [focusedPriceField, setFocusedPriceField] = useState<"min" | "max" | null>(null);

useEffect(() => {
  const media = window.matchMedia("(max-width: 640px)");
  const updateViewport = () => setIsMobileViewport(media.matches);
  updateViewport();
  media.addEventListener("change", updateViewport);
  return () => media.removeEventListener("change", updateViewport);
}, []);

useEffect(() => {
  setMinInput(formatMoneyInput(priceDraft[0]));
}, [priceDraft[0]]);

useEffect(() => {
  setMaxInput(formatMoneyInput(priceDraft[1]));
}, [priceDraft[1]]);

  // ===== PRICE SLIDER (custom 2 thumbs) =====
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const draggingRef = useRef<"min" | "max" | null>(null);
  const openPanelRef = useRef<HTMLDivElement | null>(null);
  const districtButtonRef = useRef<HTMLButtonElement | null>(null);
  const amenitiesButtonRef = useRef<HTMLButtonElement | null>(null);

  const filterRowRef = useRef<HTMLDivElement | null>(null);
const filterButtonsRef = useRef<HTMLDivElement | null>(null);
const [compactFilterText, setCompactFilterText] = useState(false);

  const closeAllFilters = () => setOpenFilter(null);
  const fmtVND = (n: number) => n.toLocaleString("vi-VN");

  

  const [minV, maxV] = useMemo(() => {
    const a = priceDraft[0];
    const b = priceDraft[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceDraft]);

  const formatMoneyDisplay = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
};

const formatMobilePriceField = (raw: string) => {
  const amount = parseMoneyInput(raw) / 1_000_000;
  return `${amount.toLocaleString("vi-VN")} triệu/tháng`;
};
  
  const span = PRICE_MAX - PRICE_MIN;

  const leftPct = ((minV - PRICE_MIN) / span) * 100;
  const rightPct = ((maxV - PRICE_MIN) / span) * 100;

  const commitPrice = () => {
    setPriceApplied((prev) => {
      if (prev[0] === priceDraft[0] && prev[1] === priceDraft[1]) return prev;
      return priceDraft;
    });
  };

  const valueFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return PRICE_MIN;

    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const pct = rect.width > 0 ? x / rect.width : 0;

    const raw = PRICE_MIN + pct * (PRICE_MAX - PRICE_MIN);
    return clamp(snap(raw), PRICE_MIN, PRICE_MAX);
  };
  

  // Drag handlers on window (mượt + không mất kéo khi ra ngoài)
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const v = valueFromClientX(e.clientX);

      startTransition(() => {
        if (draggingRef.current === "min") {
          const nextMin = Math.min(v, maxV - PRICE_STEP);
          setPriceDraft([nextMin, maxV]);
        } else {
          const nextMax = Math.max(v, minV + PRICE_STEP);
          setPriceDraft([minV, nextMax]);
        }
      });
    };

    const onUp = () => {
      draggingRef.current = null;
      setDragging(null);
      // chỉ commit khi thả
      commitPrice();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, minV, maxV]); // minV/maxV để clamp theo giá hiện tại

  // ESC để đóng dropdown
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllFilters();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
  if (openFilter === null) return;

  const onScrollCapture = (e: Event) => {
    const panel = openPanelRef.current;
    const target = e.target as Node | null;

    // Nếu scroll bên trong dropdown panel => không đóng
    if (openFilter === "amenities" && window.matchMedia(AMENITIES_MODAL_QUERY).matches) return;
    if (panel && target && panel.contains(target)) return;

    closeAllFilters();
  };

  // capture=true để bắt cả scroll event (kể cả khi scroll xảy ra ở element)
  window.addEventListener("scroll", onScrollCapture, true);

  return () => {
    window.removeEventListener("scroll", onScrollCapture, true);
  };
}, [openFilter]);

useEffect(() => {
  const row = filterRowRef.current;
  const buttons = filterButtonsRef.current;
  if (!row || !buttons) return;

  const measure = () => {
    const rowWidth = row.clientWidth;
    const buttonsWidth = buttons.scrollWidth;

    setCompactFilterText(buttonsWidth > rowWidth);
  };

  measure();

  const ro = new ResizeObserver(measure);
  ro.observe(row);
  ro.observe(buttons);

  window.addEventListener("resize", measure);

  return () => {
    ro.disconnect();
    window.removeEventListener("resize", measure);
  };
}, [
  selectedDistricts.length,
  selectedRoomTypes.length,
  openFilter,
]);

  const beginDrag = (thumb: "min" | "max") => (e: React.PointerEvent) => {
    if (loading) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = thumb;
    setDragging(thumb);
  };

  const formatMillionLabel = (v: number) => {
  if (!v) return "";
  return `~${(v / 1000000).toFixed(0)} triệu`;
};

const togglePet = (value: "cat" | "dog" | "nopet") => {
  setPetFilters((prev) => {
    // nếu đang click "Không pet"
    if (value === "nopet") {
      // nếu đã có thì bỏ, nếu chưa thì chỉ giữ mỗi nó
      return prev.includes("nopet") ? [] : ["nopet"];
    }

    // nếu click "cat" hoặc "dog"
    const withoutNoPet = prev.filter((x) => x !== "nopet");

    if (withoutNoPet.includes(value)) {
      // bỏ chọn
      return withoutNoPet.filter((x) => x !== value);
    }

    // thêm vào
    return [...withoutNoPet, value];
  });
};

const toggleTerm = (value: "short" | "long") => {
  setTermFilters((prev) => {
    const next = prev.includes(value)
      ? prev.filter((x) => x !== value)
      : [...prev, value];

    return next.length ? next : [];
  });
};

const selectedStatuses = String(statusFilter ?? "")
  .split(ROOM_STATUS_SEPARATOR)
  .map((value) => value.trim())
  .filter(
    (value): value is RoomStatusFilter =>
      value === "Đang trống" ||
      value === "Sắp trống" ||
      value === "Đã thuê"
  );

const setSelectedStatuses = (next: RoomStatusFilter[]) => {
  setStatusFilter(
    next.length ? next.join(ROOM_STATUS_SEPARATOR) : null
  );
};

const toggleStatus = (value: RoomStatusFilter) => {
  if (value === "Đã thuê") {
    setSelectedStatuses(
      selectedStatuses.includes("Đã thuê") ? [] : ["Đã thuê"]
    );
    return;
  }

  const compatibleStatuses = selectedStatuses.filter(
    (status) => status !== "Đã thuê"
  );

  const next = compatibleStatuses.includes(value)
    ? compatibleStatuses.filter((status) => status !== value)
    : [...compatibleStatuses, value];

  setSelectedStatuses(next);
};

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (loading) return;
    // click/tap vào track => chọn thumb gần nhất rồi kéo luôn
    const v = valueFromClientX(e.clientX);

    const dMin = Math.abs(v - minV);
    const dMax = Math.abs(v - maxV);
    const chosen: "min" | "max" = dMin <= dMax ? "min" : "max";

    draggingRef.current = chosen;
    setDragging(chosen);

    startTransition(() => {
      if (chosen === "min") {
        const nextMin = Math.min(v, maxV - PRICE_STEP);
        setPriceDraft([nextMin, maxV]);
      } else {
        const nextMax = Math.max(v, minV + PRICE_STEP);
        setPriceDraft([minV, nextMax]);
      }
    });
  };

 const activeFilterCount = [
   priceFilterActive,
   badgeFilterActive,
   selectedDistricts.length > 0,
   selectedRoomTypes.length > 0,
   moveFilter !== null,
   petFilters.length > 0,
   termFilters.length > 0,
   selectedStatuses.length > 0,
   featureFilters.length > 0,
 ].filter(Boolean).length;

 return (
  <section className="home-filter w-full max-w-[1440px] mx-auto px-4 md:px-6 py-5 space-y-5">
    {/* Search */}
    <form className="home-search relative" data-has-filters={activeFilterCount > 0 ? "true" : undefined}
      onSubmit={event => { event.preventDefault(); onSearchSubmit?.(); }}>
      <button type="button" className="home-filter-toggle" aria-expanded={panelOpen} aria-controls={panelId}
        aria-label={activeFilterCount > 0 ? `Bộ lọc, ${activeFilterCount} nhóm đang áp dụng` : undefined}
        onClick={() => { setPanelOpen(value => !value); closeAllFilters(); }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></svg>
        <span>Bộ lọc</span>
        {activeFilterCount > 0 && <span className="home-filter-count" aria-hidden="true">{activeFilterCount}</span>}
      </button>
      <input
        value={search}
        style={onSearchSubmit && search.trim() ? { paddingRight: "5.5rem" } : undefined}
        enterKeyHint={onSearchSubmit ? "search" : undefined}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm đường, phường, quận, mã phòng..."
        className="w-full h-[46px] rounded-2xl border border-white/40 bg-[rgba(150,150,155,0.28)] px-5 py-3 pr-12 text-base font-medium text-[#F8EAD8] placeholder:text-[#F8EAD8]/65 outline-none backdrop-blur-[28px] shadow-[0_16px_45px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.26)] transition-all focus:border-[#D8A66A]/45 focus:ring-2 focus:ring-[#D8A66A]/15"
      />

      {onSearchSubmit && search.trim() && (
        <button type="submit" aria-label="Tìm phòng" title="Tìm phòng"
          className="home-search-clear absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#F8EAD8]">
          <Search size={17} aria-hidden="true" />
        </button>
      )}
      {search.trim() !== "" && (
        <button
          type="button"
          aria-label="Xoá tìm kiếm"
          title="Xoá tìm kiếm"
          onClick={() => setSearch("")}
          style={onSearchSubmit ? { right: "3.25rem" } : undefined}
          className="home-search-clear absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#F8EAD8]/75 backdrop-blur-xl hover:bg-white/18 hover:text-white"
        >
          ×
        </button>
      )}
    </form>

    <div id={panelId} hidden={!panelOpen} className="home-filter-controls">
        {/* Overlay bắt click-outside */}
    {openFilter !== null && (
      <div
        className={`fixed inset-0 z-[1000] bg-black/25 backdrop-blur-[1px]${openFilter === "amenities" ? " room-amenities-overlay" : ""}`}
        onClick={closeAllFilters}
        onPointerDown={closeAllFilters}
      />
    )}

    {/* HÀNG NÚT */}
  <div ref={filterRowRef} className="home-filter-row flex items-center justify-between gap-2">
  <div ref={filterButtonsRef} className="home-filter-buttons flex flex-nowrap items-center gap-2">
    <a
      href="/map"
      aria-label="Tìm phòng trên bản đồ"
      title="Tìm phòng trên bản đồ"
      className="inline-flex h-[30px] min-h-[30px] shrink-0 items-center justify-center gap-1 rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.06)] px-[9px] py-[5px] text-[9.5px] font-semibold tracking-wide text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] backdrop-blur-[28px] shadow-[0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.1)] hover:border-white/40 sm:text-[10.5px]"
    >
      📍 Bản đồ
    </a>
    {/* QUẬN */}
    <div className={`relative ${openFilter === "district" ? "z-[1600]" : "z-[1500]"}`}>
      <button
        ref={districtButtonRef}
        aria-expanded={openFilter === "district"}
        aria-haspopup="dialog"
        type="button"
        onClick={() =>
          setOpenFilter((v) => (v === "district" ? null : "district"))
        }
        className={`${pillBtnBase} ${compactFilterText ? "!text-[11.7px]" : ""} ${loading ? "opacity-60" : ""} ${
          openFilter === "district"
            ? "border-[#E0B77A] bg-[rgba(180,160,135,0.45)]"
            : "border-white/20"
        }`}
      >
        Quận
        {selectedDistricts.length > 0 && (
          <span className="text-xs text-white/65">
            ({selectedDistricts.length})
          </span>
        )}
      </button>

      {openFilter === "district" && (
        <FilterChoicePanel title="Chọn quận" width={210} anchorRef={districtButtonRef} panelRef={openPanelRef}
          onClear={() => setSelectedDistricts([])} onClose={closeAllFilters}>
            {districts.map((d) => {
              const checked = selectedDistricts.includes(d);
              return (
                <label key={d} className={optionClass(checked)}>
                  <input
                    type="checkbox"
                    checked={checked}
                    className="
                      h-4 w-4 rounded-[5px]
                      border border-white/40
                      bg-white/20
                      accent-[#D8B487]
                      transition-all
                    "
                    onChange={() => {
                      setSelectedDistricts((prev) =>
                        checked ? prev.filter((x) => x !== d) : [...prev, d]
                      );
                    }}
                  />

                  <span className="text-[14px] font-medium leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                    {d}
                  </span>
                </label>
              );
            })}
        </FilterChoicePanel>
      )}
    </div>

    {/* LOẠI PHÒNG */}
    <div className="relative z-[1500]">
      <button
        type="button"
        onClick={() =>
          setOpenFilter((v) => (v === "roomType" ? null : "roomType"))
        }
        className={`${pillBtnBase} ${compactFilterText ? "!text-[11.7px]" : ""} ${loading ? "opacity-60" : ""} ${
          openFilter === "roomType"
            ? "border-[#E0B77A] bg-[rgba(180,160,135,0.45)]"
            : "border-white/20"
        }`}
      >
        Loại phòng
        {selectedRoomTypes.length > 0 && (
          <span className="text-xs text-white/65">
            ({selectedRoomTypes.length})
          </span>
        )}
      </button>

      {openFilter === "roomType" && (
        <div
          ref={(el) => {
            if (openFilter === "roomType") openPanelRef.current = el;
          }}
          className="home-filter-panel home-room-type-panel absolute left-0 top-full mt-3 z-[9999] w-max min-w-[190px] max-w-[min(92vw,320px)] max-h-[min(72dvh,520px)] overflow-y-auto rounded-3xl border border-white/35 bg-[rgba(255,255,255,0.005)] text-white backdrop-blur-[36px] shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_35px_rgba(255,210,150,0.10),inset_0_1px_0_rgba(255,255,255,0.35)] p-3 space-y-2"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[14px] font-semibold text-white">Dạng phòng</div>

            <button
              type="button"
              className="text-[11px] text-[#FFE7BE]/75 hover:text-white"
              onClick={() => setSelectedRoomTypes([])}
            >
              Clear
            </button>
          </div>

          <div className="liquid-glass-scroll max-h-64 overflow-auto space-y-0.5 pr-1">
            {roomTypes.map((t) => {
              const checked = selectedRoomTypes.includes(t);
              return (
                <label key={t} className={optionClass(checked)}>
                  <input
                    type="checkbox"
                    checked={checked}
                    className="
                      h-4 w-4 rounded-[5px]
                      border border-white/40
                      bg-white/5
                      accent-[#D8B487]
                    "
                    onChange={() => {
                      setSelectedRoomTypes((prev) =>
                        checked ? prev.filter((x) => x !== t) : [...prev, t]
                      );
                    }}
                  />
                  <span className="text-[14px] font-medium leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                    {t}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* TIỆN NGHI */}
    <div className={`relative ${openFilter === "amenities" ? "z-[1600]" : "z-[1500]"}`}>
      <button
        ref={amenitiesButtonRef}
        aria-expanded={openFilter === "amenities"}
        aria-haspopup="dialog"
        type="button"
        onClick={() =>
          setOpenFilter((v) => (v === "amenities" ? null : "amenities"))
        }
        className={`${pillBtnBase} ${compactFilterText ? "!text-[11.7px]" : ""} ${loading ? "opacity-60" : ""} ${
          openFilter === "amenities"
            ? "border-[#E0B77A] bg-[rgba(143,82,38,0.42)]"
            : "border-white/20"
        }`}
        disabled={loading}
      >
        Tiện Nghi
      </button>

      {openFilter === "amenities" && (
        <FilterChoicePanel title="Tiện nghi" amenities width={560} anchorRef={amenitiesButtonRef} panelRef={openPanelRef}
          onClear={() => { setMoveFilter(null); setPetFilters([]); setTermFilters([]); setFeatureFilters([]); }}
          onClose={closeAllFilters}>
          <AmenityGroup title="Di chuyển">
            {([
              [null, "Tất cả", LayoutGrid],
              ["elevator", "Thang máy", Elevator],
              ["stairs", "Thang bộ", Stairs],
            ] as const).map(([value, label, icon]) => (
              <AmenityOption key={label} label={label} icon={icon} radio checked={moveFilter === value}
                onChange={() => setMoveFilter(value)} />
            ))}
          </AmenityGroup>
          <AmenityGroup title="Không gian phòng">
            {roomFeatureOptions.filter((option): option is FeatureOption<"balcony" | "window"> =>
              option.value === "balcony" || option.value === "window").map(({ value, label }) => (
              <AmenityOption key={value} label={label} icon={featureIcons[value]} checked={featureFilters.includes(value)}
                onChange={() => setFeatureFilters(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} />
            ))}
          </AmenityGroup>
          <AmenityGroup title="Thú cưng">
            {([
              ["cat", "Nuôi mèo", Cat],
              ["dog", "Nuôi chó", Dog],
              ["nopet", "Không pet", NoPets],
            ] as const).map(([value, label, icon]) => (
              <AmenityOption key={value} label={label} icon={icon} checked={petFilters.includes(value)}
                onChange={() => togglePet(value)} />
            ))}
          </AmenityGroup>
          <AmenityGroup title="Thời hạn HĐ">
            {([
              ["short", "Ngắn hạn", CalendarClock],
              ["long", "Dài hạn", CalendarCheck],
            ] as const).map(([value, label, icon]) => (
              <AmenityOption key={value} label={label} icon={icon} checked={termFilters.includes(value)}
                onChange={() => toggleTerm(value)} />
            ))}
          </AmenityGroup>
          <AmenityGroup title="Quy định / Nội quy">
            {tenantRoomFeatureOptions.filter((option): option is FeatureOption<"accepts_foreign_tenants"> =>
              option.value === "accepts_foreign_tenants").map(({ value, label }) => (
              <AmenityOption key={value} label={label} icon={featureIcons[value]} checked={featureFilters.includes(value)}
                onChange={() => setFeatureFilters(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} />
            ))}
          </AmenityGroup>
        </FilterChoicePanel>
      )}
    </div>
  </div>

  {/* RIGHT: Sắp Xếp */}
  <div
    className="relative z-[1500] shrink-0"
  >
    <button
      type="button"
      onClick={() =>
        setOpenFilter((v) => (v === "sort" ? null : "sort"))
      }
      className={`${pillBtnBase} ${compactFilterText ? "!text-[11.7px]" : ""} ${loading ? "opacity-60" : ""} ${
        openFilter === "sort"
          ? "border-[#E0B77A] bg-[rgba(215,215,215,0.22)]"
          : "border-white/20"
      }`}
    >
      Sắp xếp
    </button>

    {openFilter === "sort" && (
      <div
        ref={(el) => {
          if (openFilter === "sort") openPanelRef.current = el;
        }}
        className="home-filter-panel absolute right-0 mt-3 z-[9999] w-fit min-w-[200px] rounded-3xl border border-white/40 bg-[linear-gradient(rgba(255,255,255,0.015),rgba(255,255,255,0.015))] text-white backdrop-blur-[48px] shadow-[0_40px_140px_rgba(0,0,0,0.85),0_0_60px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] p-3 space-y-2"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[14px] font-semibold text-white">Thứ tự</div>

        {(
          [
            ["updated_desc", "Mới cập nhật"],
            ["price_asc", "Giá tăng dần"],
            ["price_desc", "Giá giảm dần"],
            ["hidden", "Đã ẩn"],
          ] as const
        ).filter(([value]) => value !== "hidden" || canFilterHidden).map(([v, label]) => (
          <label key={v} className={optionClass(sortMode === v)}>
            <input
              type="radio"
              name="sortMode"
              checked={sortMode === v}
              className="
                h-4 w-4
                accent-[#D8B487]
              "
              onChange={() => {
                setSortMode(v);
                setOpenFilter(null);
              }}
            />
            <span className="text-[14px] font-medium leading-tight">
              {label}
            </span>
          </label>
        ))}

        <div className="border-t border-white/20 pt-2" />

        <div className="text-[14px] font-semibold text-white">Trạng thái</div>

        <label
        className={optionClass(selectedStatuses.length === 0)}
      >
        <input
          type="checkbox"
          checked={selectedStatuses.length === 0}
          className={checkboxClass}
          onChange={() => setStatusFilter(null)}
        />
        <span className="text-[14px] font-medium leading-tight">
          Tất cả
        </span>
      </label>

      {(
        ["Đang trống", "Sắp trống", "Đã thuê"] as const
      ).map((status) => {
        const checked = selectedStatuses.includes(status);

        return (
          <label key={status} className={optionClass(checked)}>
            <input
              type="checkbox"
              checked={checked}
              className={checkboxClass}
              onChange={() => toggleStatus(status)}
            />
            <span className="text-[14px] font-medium leading-tight">
              {status}
            </span>
          </label>
        );
      })}
      </div>
    )}
  </div>
</div>

    {/* PRICE */}
    <div className="home-price-range w-full space-y-3">
      <div className="home-price-range-controls flex w-full items-end justify-between gap-2">
        <div className="w-fit shrink-0">
          <div className="mb-1 text-xs text-[#EAD8C0]/90">
            {formatMillionLabel(priceApplied[0])}
          </div>

          <input
            inputMode="numeric"
            value={isMobileViewport && focusedPriceField !== "min" ? formatMobilePriceField(minInput) : minInput}
            onChange={(e) => {
              const rawText = e.target.value.replace(/\D/g, "");
              setMinInput(rawText);

              const rawNumber = rawText ? Number(rawText) : 0;
              if (!rawNumber) return;

              setPriceDraft([rawNumber, priceDraft[1]]);
            }}
            onFocus={() => {
              setFocusedPriceField("min");
              setMinInput((prev) => prev.replace(/\D/g, ""));
            }}
            onBlur={() => {
              const rawNumber = parseMoneyInput(minInput);

              const safeRaw = Math.max(
                PRICE_MIN,
                Math.min(rawNumber || PRICE_MIN, priceDraft[1] - 1000000)
              );

              const appliedMin = floorMillion(safeRaw);

              setPriceDraft([safeRaw, priceDraft[1]]);
              setPriceApplied([appliedMin, priceApplied[1]]);
              setMinInput(formatMoneyDisplay(String(safeRaw)));
              setFocusedPriceField(null);
            }}
            className="home-price-input-min w-[120px] rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.19)] px-[9px] py-[7px] text-center text-sm font-semibold text-[#FFF6E8] outline-none backdrop-blur-[34px] whitespace-nowrap shadow-[0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.33)] hover:border-white/40 focus:ring-2 focus:ring-white/20"
            placeholder="3000000"
          />
        </div>

        <div className="w-fit shrink-0 text-right">
          <div className="mb-1 text-right text-xs text-[#EAD8C0]/70">
            {formatMillionLabel(priceApplied[1])}
          </div>

          <input
            inputMode="numeric"
            value={isMobileViewport && focusedPriceField !== "max" ? formatMobilePriceField(maxInput) : maxInput}
            onChange={(e) => {
              const rawText = e.target.value.replace(/\D/g, "");
              setMaxInput(rawText);

              const rawNumber = rawText ? Number(rawText) : 0;
              if (!rawNumber) return;

              setPriceDraft([priceDraft[0], rawNumber]);
            }}
            onFocus={() => {
              setFocusedPriceField("max");
              setMaxInput((prev) => prev.replace(/\D/g, ""));
            }}
            onBlur={() => {
              const rawNumber = parseMoneyInput(maxInput);

              const safeRaw = Math.max(
                priceDraft[0] + 1000000,
                Math.min(rawNumber || PRICE_MAX, PRICE_MAX)
              );

              const appliedMax = ceilMillion(safeRaw);

              setPriceDraft([priceDraft[0], safeRaw]);
              setPriceApplied([priceApplied[0], appliedMax]);
              setMaxInput(formatMoneyDisplay(String(safeRaw)));
              setFocusedPriceField(null);
            }}
           className="home-price-input-max ml-auto w-[128px] rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.08)] px-[9px] py-[7px] text-center text-sm font-semibold text-[#FFF6E8] outline-none backdrop-blur-[28px] whitespace-nowrap shadow-[0_8px_28px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.12)] hover:border-white/40 focus:ring-2 focus:ring-white/20"
            placeholder="30000000"
          />
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-6 mx-4 md:mx-2"
        onPointerDown={onTrackPointerDown}
        style={{ touchAction: "none" }}
      >
        <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#D8A66A]/30" />

        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#D8A66A]"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />

        <div
          role="slider"
          aria-label="Min price"
          className="absolute top-1/2 h-[20px] w-[20px] -translate-y-1/2 cursor-pointer rounded-full bg-[#D8A66A] shadow-[0_0_18px_rgba(216,166,106,0.35)]"
          style={{ left: `calc(${leftPct}% - 10px)` }}
          onPointerDown={beginDrag("min")}
        />

        <div
          role="slider"
          aria-label="Max price"
          className="absolute top-1/2 h-[20px] w-[20px] -translate-y-1/2 cursor-pointer rounded-full bg-[#D8A66A] shadow-[0_0_18px_rgba(216,166,106,0.35)]"
          style={{ left: `calc(${rightPct}% - 10px)` }}
          onPointerDown={beginDrag("max")}
        />

        <div
          className="absolute top-1/2 h-10 -translate-y-1/2"
          style={{ left: `calc(${leftPct}% - 22px)`, width: "44px" }}
          onPointerDown={beginDrag("min")}
        />
        <div
          className="absolute top-1/2 h-10 -translate-y-1/2"
          style={{ left: `calc(${rightPct}% - 22px)`, width: "44px" }}
          onPointerDown={beginDrag("max")}
        />
      </div>
    </div>

    </div>
  </section>
);
};


export default FilterBar;
