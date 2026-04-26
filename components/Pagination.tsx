"use client";

import React from "react";

type PaginationProps = {
  goNext: () => void;
  goPrev: () => void;
  hasNext: boolean;
  loading: boolean;

  total?: number;
  page?: number;
  pageSize?: number;
};

const glassBtn =
  "rounded-2xl border border-white/30 bg-[linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-4 py-2 text-sm font-semibold text-white backdrop-blur-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all hover:bg-[rgba(255,255,255,0.1)] hover:border-white/45";

const Pagination = ({
  goNext,
  goPrev,
  hasNext,
  loading,
  total,
}: PaginationProps) => {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-3">
      <div className="flex items-center justify-between gap-3 bg-transparent px-0 py-0">
        <button
          type="button"
          onClick={goPrev}
          disabled={loading}
          className={`${glassBtn} ${loading ? "cursor-not-allowed opacity-40" : ""}`}
        >
          ← Trang Trước
        </button>

        {typeof total === "number" && (
          <div className="hidden rounded-2xl border border-white/20 bg-[linear-gradient(rgba(255,255,255,0.035),rgba(255,255,255,0.01))] px-4 py-2 text-sm font-medium text-white/70 backdrop-blur-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] sm:block">
            Tổng {total.toLocaleString("vi-VN")} phòng
          </div>
        )}

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