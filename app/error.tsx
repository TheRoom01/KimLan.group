"use client";

import { useState } from "react";

export default function GlobalErrorFallback() {
  const [reloading, setReloading] = useState(false);

  return (
    <main className="grid min-h-[55dvh] place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[#956b45]/25 bg-[#fff9ef] p-6 text-center text-[#4d3422] shadow-xl">
        <h1 className="text-xl font-bold">Chưa thể tải dữ liệu</h1>
        <p className="mt-2 text-sm leading-6 text-[#80634a]">
          Trang gặp sự cố khi tải. Bạn có thể tải lại đường dẫn hiện tại.
        </p>
        <button
          type="button"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            window.location.reload();
          }}
          className="mt-5 rounded-xl bg-[#744722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#603817] disabled:opacity-70"
        >
          {reloading ? "Đang tải lại…" : "Thử lại"}
        </button>
      </section>
    </main>
  );
}
