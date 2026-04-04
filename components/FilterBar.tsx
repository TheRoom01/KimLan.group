"use client";

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";

export type SortMode = "updated_desc" | "price_asc" | "price_desc";

type FilterBarProps = {
  districts: string[];
  roomTypes: string[];
  total?: number | null;
  priceApplied: [number, number];

  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;

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
  setSortMode: React.Dispatch<React.SetStateAction<SortMode>>;

  statusFilter: string | null;
  setStatusFilter: React.Dispatch<React.SetStateAction<string | null>>;

  loading?: boolean;
  onResetAll?: () => void;
};

const PRICE_MIN = 3_000_000;
const PRICE_MAX = 30_000_000;
const PRICE_STEP = 1_000_000;

const pillBtnBase =
  "px-2 py-0.2 rounded-full border text-[10px] flex items-center gap-0.5 transition-colors bg-black text-white hover:bg-gray-700";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const floorPrice = (v: number) => Math.floor(v / PRICE_STEP) * PRICE_STEP;
const ceilPrice = (v: number) => Math.ceil(v / PRICE_STEP) * PRICE_STEP;
const snap = (v: number) => Math.round(v / PRICE_STEP) * PRICE_STEP;
const parseMoneyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const formatMoneyInput = (n: number) => n.toLocaleString("vi-VN");
const floorMillion = (v: number) => Math.floor(v / 1000000) * 1000000;
const ceilMillion = (v: number) => Math.ceil(v / 1000000) * 1000000;

const FilterBar = ({
  districts,
  roomTypes,
  search,
  setSearch,
  priceDraft,
  priceApplied,
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
  setSortMode,
  statusFilter,
  setStatusFilter,
  total,
  loading = false,
  onResetAll,
}: FilterBarProps) => {
  const [openFilter, setOpenFilter] = useState<"district" | "roomType" | "amenities" | "sort" | null>(null);
 const [minInput, setMinInput] = useState(formatMoneyInput(priceDraft[0]));
const [maxInput, setMaxInput] = useState(formatMoneyInput(priceDraft[1]));

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
    if (panel && target && panel.contains(target)) return;

    closeAllFilters();
  };

  // capture=true để bắt cả scroll event (kể cả khi scroll xảy ra ở element)
  window.addEventListener("scroll", onScrollCapture, true);

  return () => {
    window.removeEventListener("scroll", onScrollCapture, true);
  };
}, [openFilter]);

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
  setPetFilters((prev) =>
    prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]
  );
};

const toggleTerm = (value: "short" | "long") => {
  setTermFilters((prev) => {
    const next = prev.includes(value)
      ? prev.filter((x) => x !== value)
      : [...prev, value];

    return next.length ? next : [];
  });
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

  return (
  <section className="w-full max-w-screen-2xl mx-auto px-4 py-4 space-y-3">
    {/* Search */}
    <div className="relative">
  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Tìm theo địa chỉ..."
    className="w-full rounded-xl border px-4 py-3 pr-12 text-sm outline-none focus:ring-2"
  />

  {search.trim() !== "" && (
    <button
      type="button"
      aria-label="Xoá tìm kiếm"
      title="Xoá tìm kiếm"
      onClick={() => setSearch("")}
      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 hover:text-black hover:border-black"
    >
      ×
    </button>
  )}
</div>

      {/* Overlay bắt click-outside */}
      {openFilter !== null && (
        <div className="fixed inset-0 z-40" onClick={closeAllFilters} onPointerDown={closeAllFilters} />
      )}

   {/* HÀNG NÚT */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
    {/* QUẬN */}
      <div className="relative z-50">
        <button
        type="button"
        onClick={() => setOpenFilter((v) => (v === "district" ? null : "district"))}
        className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
          openFilter === "district" ? "border-black" : "border-gray-300"
        }`}
      >
                               Quận
                            {selectedDistricts.length > 0 && <span className="text-xs text-gray-500">({selectedDistricts.length})</span>}
                          </button>

                          {openFilter === "district" && (
                            <div
                            ref={(el) => {
                    if (openFilter === "district") openPanelRef.current = el;
                  }}
                className="absolute left-0 mt-2 w-max min-w-full max-w-[min(90vw,420px)] rounded-xl border bg-white shadow p-3 space-y-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Chọn quận</div>
                  
                  <button type="button" className="text-xs text-gray-600 hover:text-black" onClick={() => setSelectedDistricts([])}>
                    Clear
                  </button>
                </div>

                <div className="max-h-64 overflow-auto space-y-1">
                  {districts.map((d) => {
                    const checked = selectedDistricts.includes(d);
                    return (
                      <label
                        key={d}
                        className={`flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-full transition-colors ${
                          checked ? "bg-black text-white" : "hover:bg-gray-100"
                        }`}
                       >
                        <input
                          type="checkbox"
                          checked={checked}
                          className="accent-black"
                          onChange={() => {
                            setSelectedDistricts((prev) =>
                              checked ? prev.filter((x) => x !== d) : [...prev, d]
                            );
                          }}
                        />
                        <span>{d}</span>
                      </label>

                    );
                  })}
                </div>
              </div>
            )}
          </div>
    

     {/* LOẠI PHÒNG */}
      <div className="relative z-50">
        <button
            type="button"
            onClick={() => setOpenFilter((v) => (v === "roomType" ? null : "roomType"))}
            className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
              openFilter === "roomType" ? "border-black" : "border-gray-300"
         }`}
       >

              Loại phòng
              {selectedRoomTypes.length > 0 && <span className="text-xs text-gray-500">({selectedRoomTypes.length})</span>}
            </button>

            {openFilter === "roomType" && (
              <div
               ref={(el) => {
      if (openFilter === "roomType") openPanelRef.current = el;
    }}
                className="absolute left-0 mt-2 w-max min-w-full max-w-[min(90vw,420px)] rounded-xl border bg-white shadow p-3 space-y-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Dạng phòng</div>
                  <button type="button" className="text-xs text-gray-600 hover:text-black" onClick={() => setSelectedRoomTypes([])}>
                    Clear
                  </button>
                </div>

                <div className="max-h-64 overflow-auto space-y-1">
                  {roomTypes.map((t) => {
                    const checked = selectedRoomTypes.includes(t);
                    return (
                       <label
                          key={t}
                          className={`flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-full transition-colors
                            ${checked ? "bg-black text-white" : "hover:bg-gray-100"}
                          `}
                         >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="accent-black"
                            onChange={() => {
                              setSelectedRoomTypes((prev) =>
                                checked ? prev.filter((x) => x !== t) : [...prev, t]
                              );
                            }}
                          />
                          <span>{t}</span>
                        </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

 {/* TIỆN NGHI */}
<div className="relative z-50 flex flex-wrap items-start gap-2">
  <button
    type="button"
    onClick={() => setOpenFilter((v) => (v === "amenities" ? null : "amenities"))}
    className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
      openFilter === "amenities" ? "border-black" : "border-gray-300"
    }`}
    disabled={loading}
  >
    <span className="flex flex-col items-start text-left leading-tight">
      <span>Tiện Nghi</span>

    </span>
  </button>

  {openFilter === "amenities" && (
    <div
      ref={(el) => {
        if (openFilter === "amenities") openPanelRef.current = el;
      }}
      className="absolute left-0 top-full mt-2 z-50 w-[min(96vw,900px)] rounded-xl border bg-white shadow p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Tiện Nghi</div>
        <button
          type="button"
          className="text-xs text-gray-600 hover:text-black"
          onClick={() => {
            setMoveFilter(null);
            setPetFilters([]);
            setTermFilters(["long"]);
          }}
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {/* CỘT 1 - DI CHUYỂN */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Di chuyển</div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="moveFilter"
              checked={moveFilter === null}
              onChange={() => setMoveFilter(null)}
            />
            <span>Tất cả</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="moveFilter"
              checked={moveFilter === "elevator"}
              onChange={() => setMoveFilter("elevator")}
            />
            <span>Thang máy</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="moveFilter"
              checked={moveFilter === "stairs"}
              onChange={() => setMoveFilter("stairs")}
            />
            <span>Thang bộ</span>
          </label>
        </div>

        {/* CỘT 2 - THÚ CƯNG */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Thú Cưng</div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={petFilters.includes("cat")}
              onChange={() => togglePet("cat")}
            />
            <span>Nuôi mèo</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={petFilters.includes("dog")}
              onChange={() => togglePet("dog")}
            />
            <span>Nuôi chó</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={petFilters.includes("nopet")}
              onChange={() => togglePet("nopet")}
            />
            <span>Không pet</span>
          </label>
        </div>

        {/* CỘT 3 - THỜI HẠN HĐ */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Thời hạn HĐ</div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={termFilters.includes("short")}
              onChange={() => toggleTerm("short")}
            />
            <span>Ngắn hạn</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={termFilters.includes("long")}
              onChange={() => toggleTerm("long")}
            />
            <span>Dài hạn</span>
          </label>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm bg-black text-white hover:bg-gray-800"
          onClick={() => setOpenFilter(null)}
        >
          Xong
        </button>
      </div>
    </div>
  )}
</div>

        </div>

   {/* RIGHT: Sắp Xếp */}
    <div className="relative z-50 shrink-0">
      <button
        type="button"
        onClick={() => setOpenFilter((v) => (v === "sort" ? null : "sort"))}
        className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
          openFilter === "sort" ? "border-black" : "border-gray-300"
        }`}
        >
        Sắp xếp
      </button>

         {openFilter === "sort" && (
  <div
    ref={(el) => {
      if (openFilter === "sort") openPanelRef.current = el;
    }}
    className="absolute right-0 mt-2 w-fit min-w-[160px] rounded-xl border bg-white shadow p-3 space-y-2"

              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium">Thứ tự</div>

              {(
                [
                  ["updated_desc", "Mới cập nhật"],
                  ["price_asc", "Giá tăng dần"],
                  ["price_desc", "Giá giảm dần"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sortMode" checked={sortMode === v} onChange={() => {
                    setSortMode(v);
                    setOpenFilter(null);
                  }} 
                  />
                  <span>{label}</span>
                </label>
              ))}
              <div className="pt-2 mt-2 border-t" />

<div className="text-sm font-medium">Trạng thái</div>

{(
  [
    [null, "Tất cả"],
    ["Trống", "Trống"],
    ["Đã thuê", "Đã thuê"],
  ] as const
).map(([v, label]) => (
  <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
    <input
      type="radio"
      name="statusFilter"
      checked={statusFilter === v}
      onChange={() => {
        
        setStatusFilter(v);
        setOpenFilter(null);
      }}
    />
    <span>{label}</span>
  </label>
))}
            </div>
          )}
        </div>
      </div>

       {/* PRICE */}
<div className="w-full space-y-3">
  <div className="flex w-full items-end justify-between gap-3">
    <div className="w-fit shrink-0">
      <div className="mb-1 text-xs text-gray-500">
        {formatMillionLabel(priceApplied[0])}
      </div>

      <input
        inputMode="numeric"
        value={minInput}
        onChange={(e) => {
          const rawText = e.target.value.replace(/\D/g, "");
          setMinInput(rawText);

          const rawNumber = rawText ? Number(rawText) : 0;
          if (!rawNumber) return;

          setPriceDraft([rawNumber, priceDraft[1]]);
        }}
        onFocus={() => {
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
        }}
        className="w-[120px] rounded-xl border px-2 py-2 text-sm text-center outline-none focus:ring-2 whitespace-nowrap"
        placeholder="3000000"
      />
    </div>

    <div className="shrink-0">
      <button
        type="button"
        className="w-[110px] px-3 py-2 rounded-xl border text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 whitespace-nowrap"
        onClick={() => {
          const resetVal: [number, number] = [PRICE_MIN, PRICE_MAX];
          setPriceDraft(resetVal);
          setPriceApplied(resetVal);
          setMinInput(formatMoneyInput(resetVal[0]));
          setMaxInput(formatMoneyInput(resetVal[1]));
          onResetAll?.();
        }}
        disabled={loading}
      >
        Xoá bộ lọc
      </button>
    </div>

    <div className="w-fit shrink-0 text-right">
      <div className="mb-1 text-xs text-gray-500 text-right">
        {formatMillionLabel(priceApplied[1])}
      </div>

      <input
        inputMode="numeric"
        value={maxInput}
        onChange={(e) => {
          const rawText = e.target.value.replace(/\D/g, "");
          setMaxInput(rawText);

          const rawNumber = rawText ? Number(rawText) : 0;
          if (!rawNumber) return;

          setPriceDraft([priceDraft[0], rawNumber]);
        }}
        onFocus={() => {
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
        }}
        className="w-[128px] ml-auto rounded-xl border px-2 py-2 text-sm text-center outline-none focus:ring-2 whitespace-nowrap"
        placeholder="30000000"
      />
    </div>
  </div>

  <div
    ref={trackRef}
    className="relative h-6 px-3 md:px-1"
    onPointerDown={onTrackPointerDown}
    style={{ touchAction: "none" }}
  >
    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-gray-400 rounded-full" />

    <div
      className="absolute top-1/2 -translate-y-1/2 h-[3px] bg-black rounded-full"
      style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
    />

    <div
      role="slider"
      aria-label="Min price"
      className="absolute top-1/2 -translate-y-1/2 w-[20px] h-[20px] rounded-full bg-black cursor-pointer shadow"
      style={{ left: `calc(${leftPct}% - 10px)` }}
      onPointerDown={beginDrag("min")}
    />

    <div
      role="slider"
      aria-label="Max price"
      className="absolute top-1/2 -translate-y-1/2 w-[20px] h-[20px] rounded-full bg-black cursor-pointer shadow"
      style={{ left: `calc(${rightPct}% - 10px)` }}
      onPointerDown={beginDrag("max")}
    />

    <div
      className="absolute top-1/2 -translate-y-1/2 h-10"
      style={{ left: `calc(${leftPct}% - 22px)`, width: "44px" }}
      onPointerDown={beginDrag("min")}
    />
    <div
      className="absolute top-1/2 -translate-y-1/2 h-10"
      style={{ left: `calc(${rightPct}% - 22px)`, width: "44px" }}
      onPointerDown={beginDrag("max")}
    />
  </div>
</div>

      {/* ✅ TOTAL ROOMS – đặt ngay dưới slider giá */}
        {typeof total === "number" && (
        <div className="mt-3 text-sm text-gray-800 text-center">
          Tổng số phòng:{" "}
          <span className="font-medium">
            {total.toLocaleString("vi-VN")}
          </span>{" "}
          phòng
        </div>
      )}
    </section>
  );
};


export default FilterBar;