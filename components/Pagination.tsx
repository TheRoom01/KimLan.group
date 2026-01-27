"use client";

import React from "react";

type PaginationProps = {
  goNext: () => void;
  goPrev: () => void;
  hasNext: boolean;
  loading: boolean;

  total?: number;    // ✅ tổng số phòng
  page?: number;     // ✅ 1-based
  pageSize?: number; // ✅
};

const Pagination = ({
  goNext,
  goPrev,
  hasNext,
  loading,
  total,
  page = 1,
  pageSize = 20,
}: PaginationProps) => {
  
  return (
    <div className="mx-auto px-2 py-2">
      <div className="flex items-center justify-between gap-2 md:justify-between md:gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={loading}
          className={`px-2 py-1 rounded border border-gray-300 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 ${
            loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          ← Trang Trước
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={loading || !hasNext}
          className={`px-2 py-1 rounded border border-gray-300 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 ${
            loading || !hasNext ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Trang Sau →
        </button>
      </div>
    </div>
  );
};

export default Pagination;
