"use client";

import React from "react";

type PaginationProps = {
  goNext: () => void;
  goPrev: () => void;
  hasNext: boolean;
  loading: boolean;
};

const Pagination = ({ goNext, goPrev, hasNext, loading }: PaginationProps) => {
  return (
    <div className="container mx-auto px-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={loading}
          className={`px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 ${
            loading ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          Trang trước
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={loading || !hasNext}
          className={`px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 ${
            loading || !hasNext ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          Trang kế tiếp
        </button>
      </div>
    </div>
  );
};

export default Pagination;
