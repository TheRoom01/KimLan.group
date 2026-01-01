"use client";

import React, { useEffect, useMemo, useState } from "react";

export type SortMode = "updated_desc" | "price_asc" | "price_desc";

type FilterBarProps = {
  // data source
  districts: string[];
  roomTypes: string[];

  // search
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;

  // price
  priceDraft: [number, number];
  setPriceDraft: React.Dispatch<React.SetStateAction<[number, number]>>;
  setPriceApplied: React.Dispatch<React.SetStateAction<[number, number]>>;

  // multi filters
  selectedDistricts: string[];
  setSelectedDistricts: React.Dispatch<React.SetStateAction<string[]>>;
  selectedRoomTypes: string[];
  setSelectedRoomTypes: React.Dispatch<React.SetStateAction<string[]>>;

  // move
  moveFilter: "elevator" | "stairs" | null;
  setMoveFilter: React.Dispatch<React.SetStateAction<"elevator" | "stairs" | null>>;

  // sort
  sortMode: SortMode;
  setSortMode: React.Dispatch<React.SetStateAction<SortMode>>;

  // ui state
  loading?: boolean;

  // optional reset all (nếu bạn muốn)
  onResetAll?: () => void;
};

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

  const closeAllFilters = () => setOpenFilter(null);

  const priceText = useMemo(() => {
    const fmt = (n: number) => n.toLocaleString("vi-VN");
    return `${fmt(priceDraft[0])} - ${fmt(priceDraft[1])}`;
  }, [priceDraft]);

  // ESC để đóng dropdown (UX mượt)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllFilters();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="container mx-auto px-4 py-6 space-y-4">
      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo mã phòng / địa chỉ..."
        className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2"
      />

      {/* Overlay bắt click-outside */}
      {openFilter !== null && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeAllFilters}
          onPointerDown={closeAllFilters}
        />
      )}

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
            {selectedDistricts.length > 0 && (
              <span className="text-xs text-gray-500">({selectedDistricts.length})</span>
            )}
          </button>

          {openFilter === "district" && (
            <div
              className="absolute mt-2 w-64 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Chọn quận</div>
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-black"
                  onClick={() => setSelectedDistricts([])}
                >
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
            className={`px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
              loading ? "opacity-60" : ""
            }`}
          >
            Loại phòng
            {selectedRoomTypes.length > 0 && (
              <span className="text-xs text-gray-500">({selectedRoomTypes.length})</span>
            )}
          </button>

          {openFilter === "roomType" && (
            <div
              className="absolute mt-2 w-64 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Chọn loại phòng</div>
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-black"
                  onClick={() => setSelectedRoomTypes([])}
                >
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
              className="absolute mt-2 w-56 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium">Chọn 1</div>

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
          )}
        </div>

        {/* SẮP XẾP */}
        <div className="relative z-50">
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
            <div
              className="absolute mt-2 w-56 rounded-xl border bg-white shadow p-3 space-y-2"
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
                  <input
                    type="radio"
                    name="sortMode"
                    checked={sortMode === v}
                    onChange={() => setSortMode(v)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* PRICE (Apply/Reset đúng UX cũ) */}
        <div className="ml-auto flex items-center gap-2">
          <div className="px-3 py-2 rounded-lg border text-sm bg-white">
            Giá: <b>{priceText}</b>
          </div>

          <input
            className="w-[140px] rounded-lg border px-3 py-2 text-sm"
            value={priceDraft[0]}
            onChange={(e) => setPriceDraft([Number(e.target.value || 0), priceDraft[1]])}
            inputMode="numeric"
          />
          <input
            className="w-[140px] rounded-lg border px-3 py-2 text-sm"
            value={priceDraft[1]}
            onChange={(e) => setPriceDraft([priceDraft[0], Number(e.target.value || 0)])}
            inputMode="numeric"
          />

          <button
            type="button"
            className="px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50"
            onClick={() => setPriceApplied(priceDraft)}
            disabled={loading}
          >
            Apply
          </button>

          <button
            type="button"
            className="px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50"
            onClick={() => {
              // reset draft+applied
              setPriceDraft([3_000_000, 30_000_000]);
              setPriceApplied([3_000_000, 30_000_000]);
              onResetAll?.();
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
};

export default FilterBar;
