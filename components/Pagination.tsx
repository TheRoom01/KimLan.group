"use client";

import React from "react";

type PaginationProps = {
  goNext: () => void;
  goPrev: () => void;
  hasNext: boolean;
  loading: boolean;

  total?: number;
};

const glassBtn =
  "rounded-2xl border border-white/25 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-[9px] tracking-wide font-semibold text-white backdrop-blur-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255,255,255,0.1)] hover:border-white/40 sm:px-4 sm:text-[10px]";

const Pagination = ({
  goNext,
  goPrev,
  hasNext,
  loading,
  total,
}: PaginationProps) => {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-3">
      <div className="relative flex items-center justify-between gap-2">

        {/* PREV */}
        <button
          type="button"
          onClick={goPrev}
          disabled={loading}
          className={`${glassBtn} ${
            loading ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          ← Trang Trước
        </button>

        {/* TOTAL */}
        {typeof total === "number" && (
          <div className="rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.07)] px-3 py-2 text-[11px] font-medium text-black/80 backdrop-blur-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] sm:px-4 sm:text-xs">
            Tổng {total.toLocaleString("vi-VN")} phòng
          </div>
        )}

        {/* NEXT */}
        <button
          type="button"
          onClick={goNext}
          disabled={loading || !hasNext}
          className={`${glassBtn} ${
            loading || !hasNext ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          Trang Sau →
        </button>

      </div>
    </div>
  );
};

export default Pagination;