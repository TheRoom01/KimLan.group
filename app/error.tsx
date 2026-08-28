"use client";

export default function GlobalErrorFallback({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[55dvh] place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-[#956b45]/25 bg-[#fff9ef] p-6 text-center text-[#4d3422] shadow-xl">
        <h1 className="text-xl font-bold">Chưa thể tải dữ liệu</h1>
        <p className="mt-2 text-sm leading-6 text-[#80634a]">
          Kết nối đang không ổn định. Bạn có thể thử lại mà không cần đóng trang.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-[#744722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#603817]"
        >
          Thử lại
        </button>
      </section>
    </main>
  );
}
