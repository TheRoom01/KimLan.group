"use client";

import React from "react";
import styles from "./Pagination.module.css";

type PaginationProps = {
  goNext: () => void;
  goPrev: () => void;
  hasNext: boolean;
  loading: boolean;

  onConsult: () => void;
};

const glassBtn =
  "rounded-2xl border border-white/25 bg-[rgba(255, 255, 255, 0)] px-[10px] py-[6px] text-[10px] tracking-wide font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] backdrop-blur-[28px] shadow-[0_8px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:bg-[rgba(255, 255, 255, 0)] hover:border-white/40 sm:px-3 sm:text-[11px]";

const Pagination = ({
  goNext,
  goPrev,
  hasNext,
  loading,
  onConsult,
}: PaginationProps) => {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">

        {/* PREV */}
        <button
          type="button"
          onClick={goPrev}
          disabled={loading}
          className={`${glassBtn} justify-self-start ${
            loading ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          ← Trước
        </button>

        <button type="button" onClick={onConsult} className={`${styles.consultButton} min-h-11 rounded-2xl border px-4 py-2 text-xs font-bold sm:text-sm`}>Cần Tư Vấn</button>

        {/* NEXT */}
        <button
          type="button"
          onClick={goNext}
          disabled={loading || !hasNext}
          className={`${glassBtn} justify-self-end ${
            loading || !hasNext ? "cursor-not-allowed opacity-40" : ""
          }`}
        >
          Sau →
        </button>

      </div>
    </div>
  );
};

export default Pagination;