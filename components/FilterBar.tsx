"use client";

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";

export type SortMode = "updated_desc" | "price_asc" | "price_desc";

type FilterBarProps = {
  districts: string[];
  roomTypes: string[];

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

  sortMode: SortMode;
  setSortMode: React.Dispatch<React.SetStateAction<SortMode>>;

  loading?: boolean;
  onResetAll?: () => void;
};

const PRICE_MIN = 3_000_000;
const PRICE_MAX = 30_000_000;
const PRICE_STEP = 100_000;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const snap = (v: number) => Math.round(v / PRICE_STEP) * PRICE_STEP;

const FilterBar = ({
  districts,
  roomTypes,
  search,
  setSearch,
  priceDraft,
  setPriceDraft,
  setPriceApplied,
  selectedDistricts,
  setSelectedDistricts,
  selectedRoomTypes,
  setSelectedRoomTypes,
  moveFilter,
  setMoveFilter,
  sortMode,
  setSortMode,
  loading = false,
  onResetAll,
}: FilterBarProps) => {
  const [openFilter, setOpenFilter] = useState<"district" | "roomType" | "move" | "sort" | null>(null);

  // ===== PRICE SLIDER (custom 2 thumbs) =====
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const draggingRef = useRef<"min" | "max" | null>(null);

  const closeAllFilters = () => setOpenFilter(null);
  const fmtVND = (n: number) => n.toLocaleString("vi-VN");

  const [minV, maxV] = useMemo(() => {
    const a = priceDraft[0];
    const b = priceDraft[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceDraft]);

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

  const beginDrag = (thumb: "min" | "max") => (e: React.PointerEvent) => {
    if (loading) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = thumb;
    setDragging(thumb);
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
    <section className="container mx-auto px-4 py-6 space-y-4">
      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo địa chỉ..."
        className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2"
      />

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
              className={`px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Quận
              {selectedDistricts.length > 0 && <span className="text-xs text-gray-500">({selectedDistricts.length})</span>}
            </button>

            {openFilter === "district" && (
              <div
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
                      <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedDistricts((prev) => (checked ? prev.filter((x) => x !== d) : [...prev, d]));
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
              className={`px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Loại phòng
              {selectedRoomTypes.length > 0 && <span className="text-xs text-gray-500">({selectedRoomTypes.length})</span>}
            </button>

            {openFilter === "roomType" && (
              <div
                className="absolute left-0 mt-2 w-max min-w-full max-w-[min(90vw,420px)] rounded-xl border bg-white shadow p-3 space-y-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Chọn loại phòng</div>
                  <button type="button" className="text-xs text-gray-600 hover:text-black" onClick={() => setSelectedRoomTypes([])}>
                    Clear
                  </button>
                </div>

                <div className="max-h-64 overflow-auto space-y-1">
                  {roomTypes.map((t) => {
                    const checked = selectedRoomTypes.includes(t);
                    return (
                      <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedRoomTypes((prev) => (checked ? prev.filter((x) => x !== t) : [...prev, t]));
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

          {/* DI CHUYỂN */}
          <div className="relative z-50">
            <button
              type="button"
              onClick={() => setOpenFilter((v) => (v === "move" ? null : "move"))}
              className={`px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Di chuyển
              {moveFilter && <span className="text-xs text-gray-500">({moveFilter})</span>}
            </button>

            {openFilter === "move" && (
              <div
                className="absolute left-0 mt-2 w-max min-w-full max-w-[min(90vw,360px)] rounded-xl border bg-white shadow p-3 space-y-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-sm font-medium">Chọn 1</div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="moveFilter" checked={moveFilter === null} onChange={() => setMoveFilter(null)} />
                  <span>Tất cả</span>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="moveFilter" checked={moveFilter === "elevator"} onChange={() => setMoveFilter("elevator")} />
                  <span>Thang máy</span>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="moveFilter" checked={moveFilter === "stairs"} onChange={() => setMoveFilter("stairs")} />
                  <span>Thang bộ</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: SẮP XẾP */}
        <div className="relative z-50 shrink-0">
          <button
            type="button"
            onClick={() => setOpenFilter((v) => (v === "sort" ? null : "sort"))}
            className={`px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
              loading ? "opacity-60" : ""
            }`}
          >
            Sắp xếp
          </button>

          {openFilter === "sort" && (
            <div className="absolute right-0 mt-2 w-fit min-w-[160px] rounded-xl border bg-white shadow p-3 space-y-2"

              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium">Chọn 1</div>

              {(
                [
                  ["updated_desc", "Mới cập nhật"],
                  ["price_asc", "Giá tăng dần"],
                  ["price_desc", "Giá giảm dần"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sortMode" checked={sortMode === v} onChange={() => setSortMode(v)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PRICE (custom slider - luôn kéo được min/max, mobile mượt, chỉ commit khi thả) */}
      <div className="w-full">
        <div className="grid grid-cols-3 items-center text-sm font-semibold mb-2">
          <span className="justify-self-start">{fmtVND(minV)} đ</span>

          <button
            type="button"
            className="justify-self-center px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50"
            onClick={() => {
              const resetVal: [number, number] = [PRICE_MIN, PRICE_MAX];
              setPriceDraft(resetVal);
              setPriceApplied(resetVal);
              onResetAll?.();
            }}
            disabled={loading}
          >
            Reset
          </button>

          <span className="justify-self-end">{fmtVND(maxV)} đ</span>
        </div>

        <div
          ref={trackRef}
          className="relative h-8"
          onPointerDown={onTrackPointerDown}
          style={{ touchAction: "none" }} // rất quan trọng cho mobile: tránh scroll giành gesture
        >
          {/* base gray line */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-gray-300 rounded" />

          {/* selected black segment */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-black rounded"
            style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
          />

          {/* THUMB MIN */}
          <div
            role="slider"
            aria-label="Min price"
            className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full bg-black cursor-pointer"
            style={{ left: `calc(${leftPct}% - 7px)` }}
            onPointerDown={beginDrag("min")}
          />

          {/* THUMB MAX */}
          <div
            role="slider"
            aria-label="Max price"
            className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full bg-black cursor-pointer"
            style={{ left: `calc(${rightPct}% - 7px)` }}
            onPointerDown={beginDrag("max")}
          />

          {/* hit-area tăng dễ kéo (mobile) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-8"
            style={{ left: `calc(${leftPct}% - 18px)`, width: "36px" }}
            onPointerDown={beginDrag("min")}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-8"
            style={{ left: `calc(${rightPct}% - 18px)`, width: "36px" }}
            onPointerDown={beginDrag("max")}
          />
        </div>
      </div>
    </section>
  );
};

export default FilterBar;
