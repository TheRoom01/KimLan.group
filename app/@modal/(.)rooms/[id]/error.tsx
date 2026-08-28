"use client";

export default function RoomModalError({ reset }: { reset: () => void }) {
  return (
    <div className="fixed inset-0 z-[99999] grid place-items-end bg-black/45 sm:place-items-center sm:p-6">
      <section className="w-full max-w-xl rounded-t-[28px] border border-white/20 bg-[#e9d7c3] p-6 text-center text-[#4d3422] shadow-2xl sm:rounded-[28px]">
        <h2 className="text-lg font-bold">Không thể mở chi tiết phòng</h2>
        <p className="mt-2 text-sm text-[#80634a]">Kết nối tạm thời bị gián đoạn.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-[#744722] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Tải lại
        </button>
      </section>
    </div>
  );
}
