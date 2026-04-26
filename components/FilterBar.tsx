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
 "min-h-[42px] px-5 py-2 rounded-2xl border text-sm font-semibold flex items-center gap-1 transition-all bg-[rgba(255,255,255,0.055)] text-[#F4E7D6] border-white/24 backdrop-blur-[28px] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_12px_30px_rgba(0,0,0,0.28)] hover:bg-[rgba(255,255,255,0.13)] hover:border-white/36 hover:text-white";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const floorPrice = (v: number) => Math.floor(v / PRICE_STEP) * PRICE_STEP;
const ceilPrice = (v: number) => Math.ceil(v / PRICE_STEP) * PRICE_STEP;
const snap = (v: number) => Math.round(v / PRICE_STEP) * PRICE_STEP;
const parseMoneyInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

const optionClass = (checked: boolean) => `
  group flex cursor-pointer items-center gap-3
  rounded-xl px-3 py-2 text-sm transition-all
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
  <section className="w-full max-w-[1240px] mx-auto px-4 md:px-6 py-5 space-y-5">
    {/* Search */}
    <div className="relative">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo địa chỉ..."
        className="w-full h-[36px] rounded-2xl border border-white/20 bg-[rgba(150,150,155,0.28)] px-5 py-3 pr-12 text-base font-medium text-[#F8EAD8] placeholder:text-[#F8EAD8]/65 outline-none backdrop-blur-[28px] shadow-[0_16px_45px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.26)] transition-all focus:border-[#D8A66A]/45 focus:ring-2 focus:ring-[#D8A66A]/15"
      />

      {search.trim() !== "" && (
        <button
          type="button"
          aria-label="Xoá tìm kiếm"
          title="Xoá tìm kiếm"
          onClick={() => setSearch("")}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#F8EAD8]/75 backdrop-blur-xl hover:bg-white/18 hover:text-white"
        >
          ×
        </button>
      )}
    </div>

    {/* Overlay bắt click-outside */}
    {openFilter !== null && openFilter !== "amenities" && (
      <div
        className="fixed inset-0 z-[1000] bg-black/25 backdrop-blur-[1px]"
        onClick={closeAllFilters}
        onPointerDown={closeAllFilters}
      />
    )}

    {/* HÀNG NÚT */}
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* QUẬN */}
        <div className="relative z-[1500]">
          <button
            type="button"
            onClick={() =>
              setOpenFilter((v) => (v === "district" ? null : "district"))
            }
            className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
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
            <div
              ref={(el) => {
                if (openFilter === "district") openPanelRef.current = el;
              }}
             className="absolute left-0 mt-3 z-[9999] w-[200px] rounded-3xl border border-white/35 bg-[rgba(255,255,255,0.0015)] text-white backdrop-blur-[36px] shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_35px_rgba(255,210,150,0.10),inset_0_1px_0_rgba(255,255,255,0.35)] p-4"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Chọn quận</div>

                <button
                  type="button"
                  className="text-xs text-[#FFE7BE]/75 hover:text-white"
                  onClick={() => setSelectedDistricts([])}
                >
                  Clear
                </button>
              </div>

              <div className="liquid-glass-scroll max-h-64 overflow-y-auto space-y-1 pr-2">
              {districts.map((d) => {
                const checked = selectedDistricts.includes(d);
                return (
                  <label
                    key={d}
                    className={`
                      group flex cursor-pointer items-center gap-3
                      rounded-xl px-3 py-2 text-sm transition-all
                      ${
                        checked
                          ? "bg-[rgba(216,180,135,0.22)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                          : "text-white/90 hover:bg-[rgba(216,180,135,0.14)] hover:text-white"
                      }
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className="
                        h-4 w-4 rounded-[5px]
                        border border-white/40
                        bg-white/5
                        accent-[#D8B487]
                        transition-all
                      "
                      onChange={() => {
                        setSelectedDistricts((prev) =>
                          checked ? prev.filter((x) => x !== d) : [...prev, d]
                        );
                      }}
                    />

                    <span className="font-medium drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
                      {d}
                    </span>
                  </label>
                );
              })}
            </div>
            </div>
          )}
        </div>

        {/* LOẠI PHÒNG */}
        <div className="relative z-[1500]">
          <button
            type="button"
            onClick={() =>
              setOpenFilter((v) => (v === "roomType" ? null : "roomType"))
            }
            className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
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
            className="absolute right-0 mt-3 z-[9999] w-fit min-w-[190px] rounded-3xl border border-white/35 bg-[rgba(255,255,255,0.005)] text-white backdrop-blur-[36px] shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_35px_rgba(255,210,150,0.10),inset_0_1px_0_rgba(255,255,255,0.35)] p-4 space-y-3"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Dạng phòng</div>

                <button
                  type="button"
                  className="text-xs text-[#FFE7BE]/75 hover:text-white"
                  onClick={() => setSelectedRoomTypes([])}
                >
                  Clear
                </button>
              </div>

              <div className="liquid-glass-scroll max-h-64 overflow-auto space-y-1 pr-1">
                {roomTypes.map((t) => {
                  const checked = selectedRoomTypes.includes(t);
                  return (
                    <label key={t} className={optionClass(checked)}>
                      <input
                        type="checkbox"
                        checked={checked}
                        className={checkboxClass}
                        onChange={() => {
                          setSelectedRoomTypes((prev) =>
                            checked ? prev.filter((x) => x !== t) : [...prev, t]
                          );
                        }}
                      />
                      <span className="font-medium drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
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
        <div className="relative z-[1500] flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() =>
              setOpenFilter((v) => (v === "amenities" ? null : "amenities"))
            }
            className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
              openFilter === "amenities"
                ? "border-[#E0B77A] bg-[rgba(180,160,135,0.45)]"
                : "border-white/20"
            }`}
            disabled={loading}
          >
            Tiện Nghi
          </button>

          {openFilter === "amenities" && (
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4"
              onPointerDown={closeAllFilters}
              onClick={closeAllFilters}
            >
              <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

              <div
                ref={(el) => {
                  if (openFilter === "amenities") openPanelRef.current = el;
                }}
               className="relative z-10 w-full max-w-[680px] max-h-[85vh] overflow-y-auto rounded-3xl 
border border-white/40 
bg-[linear-gradient(rgba(255,255,255,0.015),rgba(255,255,255,0.015))] 
text-white 
backdrop-blur-[50px] 
shadow-[0_45px_140px_rgba(0,0,0,0.85),0_0_60px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] 
p-4 sm:p-5"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-white">
                    Tiện Nghi
                  </div>

                  <button
                    type="button"
                    className="text-sm text-[#FFE7BE]/75 hover:text-white"
                    onClick={() => {
                      setMoveFilter(null);
                      setPetFilters([]);
                      setTermFilters(["long"]);
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-white">
                      Di chuyển
                    </div>

                    {[
                      [null, "Tất cả"],
                      ["elevator", "Thang máy"],
                      ["stairs", "Thang bộ"],
                    ].map(([value, label]) => (
                      <label key={String(value)} className={optionClass(moveFilter === value)}>
                        <input
                          type="radio"
                          name="moveFilter"
                          checked={moveFilter === value}
                          className={radioClass}
                          onChange={() => setMoveFilter(value as any)}
                        />
                        <span className="font-medium">{label}</span>
                      </label>
                    ))}

                    <div className="mt-2 border-t border-white/20 pt-1 md:hidden" />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-white">
                      Thú Cưng
                    </div>

                    {[
                      ["cat", "Nuôi mèo"],
                      ["dog", "Nuôi chó"],
                      ["nopet", "Không pet"],
                    ].map(([value, label]) => {
                      const checked = petFilters.includes(value as "cat" | "dog" | "nopet");

                      return (
                        <label key={value} className={optionClass(checked)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            className={checkboxClass}
                            onChange={() => togglePet(value as "cat" | "dog" | "nopet")}
                          />
                          <span className="font-medium">{label}</span>
                        </label>
                      );
                    })}

                    <div className="mt-2 border-t border-white/20 pt-1 md:hidden" />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-white">
                      Thời hạn HĐ
                    </div>

                    {[
                      ["short", "Ngắn hạn"],
                      ["long", "Dài hạn"],
                    ].map(([value, label]) => {
                      const checked = termFilters.includes(value as "short" | "long");

                      return (
                        <label key={value} className={optionClass(checked)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            className={checkboxClass}
                            onChange={() => toggleTerm(value as "short" | "long")}
                          />
                          <span className="font-medium">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="rounded-xl border border-white/20 bg-white/12 px-5 py-2 text-sm font-semibold text-white backdrop-blur-xl hover:bg-white/20"
                    onClick={() => setOpenFilter(null)}
                  >
                    Xong
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Sắp Xếp */}
      <div
        className={`relative z-[1500] shrink-0 ${
          openFilter === "amenities" ? "invisible pointer-events-none" : ""
        }`}
      >
        <button
          type="button"
          onClick={() =>
            setOpenFilter((v) => (v === "sort" ? null : "sort"))
          }
          className={`${pillBtnBase} ${loading ? "opacity-60" : ""} ${
            openFilter === "sort"
              ? "border-[#E0B77A] bg-[rgba(180,160,135,0.45)]"
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
           className="absolute right-0 mt-3 z-[9999] w-fit min-w-[200px] rounded-3xl 
border border-white/40 
bg-[linear-gradient(rgba(255,255,255,0.015),rgba(255,255,255,0.015))] 
text-white 
backdrop-blur-[48px] 
shadow-[0_40px_140px_rgba(0,0,0,0.85),0_0_60px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] 
p-4 space-y-3"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-white">Thứ tự</div>

            {(
              [
                ["updated_desc", "Mới cập nhật"],
                ["price_asc", "Giá tăng dần"],
                ["price_desc", "Giá giảm dần"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className={optionClass(sortMode === v)}>
  <input
    type="radio"
    name="sortMode"
    checked={sortMode === v}
    className={radioClass}
    onChange={() => {
      setSortMode(v);
      setOpenFilter(null);
    }}
  />
  <span className="font-medium">{label}</span>
</label>
            ))}

            <div className="border-t border-white/20 pt-3" />

            <div className="text-sm font-semibold text-white">Trạng thái</div>

            {(
              [
                [null, "Tất cả"],
                ["Trống", "Trống"],
                ["Đã thuê", "Đã thuê"],
              ] as const
            ).map(([v, label]) => (
              <label key={label} className={optionClass(statusFilter === v)}>
                <input
                  type="radio"
                  name="statusFilter"
                  checked={statusFilter === v}
                  className={radioClass}
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
          <div className="mb-1 text-xs text-[#EAD8C0]/70">
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
            className="w-[120px] rounded-xl border border-white/15 bg-[rgba(255,255,255,0.08)] px-2 py-2 text-center text-sm text-[#F6E7D2] outline-none backdrop-blur-xl whitespace-nowrap focus:ring-2 focus:ring-white/15"
            placeholder="3000000"
          />
        </div>

        <div className="shrink-0">
          <button
            type="button"
            className="w-[110px] rounded-xl border border-[#D8A66A]/35 bg-[rgba(150,150,155,0.28)] px-3 py-2 text-sm text-[#F6E7D2] backdrop-blur-xl whitespace-nowrap hover:bg-[rgba(180,160,135,0.35)]"
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
          <div className="mb-1 text-right text-xs text-[#EAD8C0]/70">
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
            className="ml-auto w-[128px] rounded-xl border border-white/15 bg-[rgba(255,255,255,0.08)] px-2 py-2 text-center text-sm text-[#F6E7D2] outline-none backdrop-blur-xl whitespace-nowrap focus:ring-2 focus:ring-white/15"
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

  </section>
);
};


export default FilterBar;