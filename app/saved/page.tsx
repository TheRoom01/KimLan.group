"use client";

import { useEffect, useMemo, useState } from "react";
import RoomCard from "@/components/RoomCard";
import { getSavedRoomIds, SAVED_ROOMS_KEY } from "@/lib/savedRooms";

const PAGE_SIZE = 20;

export default function SavedRoomsPage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [page, setPage] = useState(1);

 useEffect(() => {
  const ids = getSavedRoomIds();
  setSavedIds(ids);

  if (ids.length === 0) {
    setRooms([]);
    return;
  }

  async function loadSavedRooms() {
    try {
      const res = await fetch(`/api/saved-rooms?ids=${ids.join(",")}`, {
        cache: "no-store",
      });

      const json = await res.json();
      setRooms(Array.isArray(json.data) ? json.data : []);
    } catch {
      setRooms([]);
    }
  }

  loadSavedRooms();
 }, []);

  const savedRooms = useMemo(() => {
    return savedIds
      .map((id) => rooms.find((room) => room.id === id))
      .filter(Boolean);
  }, [savedIds, rooms]);

  const clearAllSavedRooms = () => {
  localStorage.removeItem(SAVED_ROOMS_KEY);
  setSavedIds([]);
  setRooms([]);
  setPage(1);
  window.dispatchEvent(new Event("saved-rooms-changed"));
  };
  const totalPages = Math.max(1, Math.ceil(savedRooms.length / PAGE_SIZE));

  const pagedRooms = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return savedRooms.slice(start, start + PAGE_SIZE);
  }, [savedRooms, page]);

  return (
    <main className="min-h-screen overflow-y-auto bg-[#120B08] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="sticky top-0 z-50 mb-5 flex items-center justify-between gap-3 border-b border-white/10 bg-[#120B08]/80 py-3 backdrop-blur-[24px]">
          <div>
            <h1 className="text-xl font-bold">Phòng đã lưu</h1>
            <p className="text-sm text-white/60">
              Tổng {savedIds.length.toLocaleString("vi-VN")} phòng
            </p>
          </div>

          <div className="flex items-center gap-2">
        <button
            type="button"
            onClick={clearAllSavedRooms}
            disabled={savedIds.length === 0}
            className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 backdrop-blur-[24px] disabled:cursor-not-allowed disabled:opacity-40"
        >
            Xoá tất cả
        </button>

        <a
            href="/"
            className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[24px]"
        >
            Trang chủ
        </a>
        </div>
        </div>

        {pagedRooms.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pagedRooms.map((room: any, index: number) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  adminLevel={0}
                  index={index}
                  onNavigate={(href) => {
                    window.location.href = href;
                  }}
                />
              ))}
            </div>

            <div className="mt-8 flex items-center justify-center gap-3 pb-10">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                ← Trước
              </button>

              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80">
                {page}/{totalPages}
              </div>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Sau →
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 text-center text-white/70">
            Bạn chưa lưu phòng nào hoặc cần quay lại trang chủ để tải dữ liệu phòng.
          </div>
        )}
      </div>
    </main>
  );
}