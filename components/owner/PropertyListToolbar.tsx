"use client";

import { Check, Filter, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

export type PropertyOccupancyFilter = "empty" | "full";

/*
|--------------------------------------------------------------------------
| MÀU MODAL BỘ LỌC
|--------------------------------------------------------------------------
| Chỉnh màu trực tiếp tại đây.
|
| background: màu nền modal
| border: màu viền modal
| text: màu chữ chính
| mutedText: màu chữ mô tả
| optionBackground: nền lựa chọn thường
| optionHoverBackground: nền khi rê chuột
| activeBackground: nền lựa chọn đang bật
| activeCheck: màu dấu tích
| shadow: bóng modal
|--------------------------------------------------------------------------
*/

const FILTER_MODAL_THEME = {
  background: "rgba(136,89,51,0.71)",
  border: "rgba(255,255,255,0.8)",
  text: "#fffaf4",
  mutedText: "rgba(255, 250, 244, 0.62)",

  optionBackground: "rgba(255, 255, 255, 0.12)",
  optionHoverBackground: "rgba(243,206,158,0.83)",
  activeBackground: "rgba(206,180,131,0.75)",

  activeCheck: "#bbf7d0",

  closeButtonBackground: "rgba(255, 255, 255, 0.08)",
  closeButtonHoverBackground: "rgba(255, 255, 255, 0.16)",

  shadow:
    "0 24px 70px rgba(41, 23, 12, 0.38), inset 0 1px 0 rgba(255,255,255,0.3)",
};

const OPTIONS: Array<{
  value: PropertyOccupancyFilter;
  label: string;
}> = [
  {
    value: "empty",
    label: "Có phòng trống",
  },
  {
    value: "full",
    label: "Đã full phòng",
  },
];

type FilterModalPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

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

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [modalPosition, setModalPosition] =
    useState<FilterModalPosition>({
      top: 0,
      left: 12,
      width: 320,
      maxHeight: 400,
    });

  /*
  |--------------------------------------------------------------------------
  | TÌM KIẾM
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (search === initialSearch) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const value = search.trim();

      if (value) {
        params.set("building_search", value);
      } else {
        params.delete("building_search");
      }

      startTransition(() => {
        router.replace(`/owner/properties?${params.toString()}`, {
          scroll: false,
        });
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [initialSearch, router, search, searchParams]);

  /*
  |--------------------------------------------------------------------------
  | TÍNH VỊ TRÍ MODAL
  |--------------------------------------------------------------------------
  | Modal dùng Portal nhưng vẫn nằm ngay dưới nút Bộ lọc.
  */

  useLayoutEffect(() => {
    if (!mobileFilterOpen) return;

    const updateModalPosition = () => {
      const button = filterButtonRef.current;
      if (!button) return;

      const buttonRect = button.getBoundingClientRect();

      const viewportPadding = 12;
      const gap = 8;

      /*
       * Ưu tiên chiều rộng bằng nút bộ lọc.
       * Không để rộng hơn màn hình.
       */
      const modalWidth = Math.min(
        Math.max(buttonRect.width, 280),
        window.innerWidth - viewportPadding * 2
      );

      /*
       * Căn modal theo mép trái nút.
       */
      let left = buttonRect.left;

      /*
       * Nếu tràn bên phải, tự dịch sang trái.
       */
      if (left + modalWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - modalWidth - viewportPadding;
      }

      /*
       * Không để modal tràn bên trái.
       */
      left = Math.max(viewportPadding, left);

      /*
       * Luôn đặt ngay dưới nút bộ lọc.
       */
      const top = buttonRect.bottom + gap;

      /*
       * Giới hạn chiều cao modal trong màn hình.
       */
      const maxHeight = Math.max(
        160,
        window.innerHeight - top - viewportPadding
      );

      setModalPosition({
        top,
        left,
        width: modalWidth,
        maxHeight,
      });
    };

    updateModalPosition();

    const animationFrame =
      window.requestAnimationFrame(updateModalPosition);

    window.addEventListener("resize", updateModalPosition);
    window.addEventListener("scroll", updateModalPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateModalPosition);
      window.removeEventListener("scroll", updateModalPosition, true);
    };
  }, [mobileFilterOpen]);

  /*
  |--------------------------------------------------------------------------
  | ĐÓNG MODAL KHI BẤM BÊN NGOÀI
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!mobileFilterOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;

      const clickedInsideModal =
        modalRef.current?.contains(event.target);

      const clickedFilterButton =
        filterButtonRef.current?.contains(event.target);

      if (!clickedInsideModal && !clickedFilterButton) {
        setMobileFilterOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileFilterOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeOutside,
        true
      );
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileFilterOpen]);

  /*
  |--------------------------------------------------------------------------
  | CHỌN BỘ LỌC
  |--------------------------------------------------------------------------
  */

  const selectFilter = (value: PropertyOccupancyFilter) => {
    const params = new URLSearchParams(searchParams.toString());

    if (activeFilter === value) {
      params.delete("occupancy");
    } else {
      params.set("occupancy", value);
    }

    setMobileFilterOpen(false);

    startTransition(() => {
      router.replace(`/owner/properties?${params.toString()}`, {
        scroll: false,
      });
    });
  };

  const clearFilter = () => {
  const params = new URLSearchParams(searchParams.toString());

  params.delete("occupancy");
  setMobileFilterOpen(false);

  startTransition(() => {
    router.replace(`/owner/properties?${params.toString()}`, {
      scroll: false,
    });
  });
};

  const filterModal =
    mobileFilterOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Lọc danh sách tòa nhà"
            style={{
              top: modalPosition.top,
              left: modalPosition.left,
              width: modalPosition.width,
              maxHeight: modalPosition.maxHeight,

              background: FILTER_MODAL_THEME.background,
              borderColor: FILTER_MODAL_THEME.border,
              color: FILTER_MODAL_THEME.text,
              boxShadow: FILTER_MODAL_THEME.shadow,
            }}
            className="
              fixed z-[9999]
              overflow-x-hidden overflow-y-auto
              overscroll-contain
              rounded-2xl
              border
              p-2
              backdrop-blur-[26px]
              backdrop-saturate-150
              md:hidden
            "
          >
            {/* Ánh sáng Liquid Glass phía trên */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute inset-x-5 top-0
                h-px
                bg-gradient-to-r
                from-transparent via-white/70 to-transparent
              "
            />

            {/* Lớp ánh sáng bên trong modal */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute inset-[1px]
                rounded-[15px]
                bg-gradient-to-br
                from-white/14
                via-white/[0.025]
                to-white/[0.06]
              "
            />

            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
                <div className="min-w-0">
                  <p
                    className="text-base font-bold"
                    style={{ color: FILTER_MODAL_THEME.text }}
                  >
                    Lọc tòa nhà
                  </p>

                  
                </div>

                <div className="shrink-0">
                <button
                  type="button"
                  onClick={clearFilter}
                  className="
                    inline-flex h-9 items-center justify-center
                    rounded-xl
                    px-2.5
                    text-sm font-medium
                    transition
                    hover:bg-white/10
                  "
                  style={{
                    color: FILTER_MODAL_THEME.mutedText,
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

              <div className="space-y-1 pb-1">
                {OPTIONS.map((option) => {
                  const isActive =
                    activeFilter === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        selectFilter(option.value)
                      }
                      style={{
                        color: isActive
                          ? FILTER_MODAL_THEME.text
                          : FILTER_MODAL_THEME.mutedText,

                        background: isActive
                          ? FILTER_MODAL_THEME.activeBackground
                          : FILTER_MODAL_THEME.optionBackground,
                      }}
                      className="
                        flex w-full
                        items-center gap-3
                        rounded-xl
                        border border-transparent
                        px-3 py-3
                        text-left
                        transition
                        hover:border-white/10
                      "
                      onPointerEnter={(event) => {
                        if (!isActive) {
                          event.currentTarget.style.background =
                            FILTER_MODAL_THEME.optionHoverBackground;
                          event.currentTarget.style.color =
                            FILTER_MODAL_THEME.text;
                        }
                      }}
                      onPointerLeave={(event) => {
                        if (!isActive) {
                          event.currentTarget.style.background =
                            FILTER_MODAL_THEME.optionBackground;
                          event.currentTarget.style.color =
                            FILTER_MODAL_THEME.mutedText;
                        }
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <strong
                          className="block text-sm font-semibold"
                          style={{
                            color: FILTER_MODAL_THEME.text,
                          }}
                        >
                          {option.label}
                        </strong>
                      </span>

                      {isActive ? (
                        <Check
                          className="h-5 w-5 shrink-0"
                          style={{
                            color:
                              FILTER_MODAL_THEME.activeCheck,
                          }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="relative z-20 flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[#d7bea0]/45 bg-[#fffaf1]/75 p-2.5 shadow-[0_8px_24px_rgba(91,57,31,0.05)] backdrop-blur-md md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">
            Tìm theo đầy đủ địa chỉ tòa nhà
          </span>

          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d725c]" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
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

          {isPending ? (
            <span className="absolute bottom-0 left-3 right-3 h-0.5 animate-pulse rounded-full bg-[#9b6840]" />
          ) : null}
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
          ref={filterButtonRef}
          type="button"
          aria-expanded={mobileFilterOpen}
          aria-haspopup="dialog"
          aria-label="Lọc tòa nhà theo tình trạng phòng"
          onClick={() =>
            setMobileFilterOpen((current) => !current)
          }
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold md:hidden ${
            activeFilter
              ? "border-[#744722] bg-[#744722] text-white"
              : "border-[#dec9ad] bg-white/90 text-[#68482f]"
          }`}
        >
          <Filter className="h-4 w-4" />

          {activeFilter === "empty"
            ? "Có phòng trống"
            : activeFilter === "full"
              ? "Đã full phòng"
              : "Bộ lọc"}
        </button>
      </div>

      {filterModal}
    </>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
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
      {active ? (
        <Check className="h-4 w-4" />
      ) : (
        <Filter className="h-4 w-4" />
      )}

      {label}
    </button>
  );
}