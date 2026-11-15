"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { RoomModalLoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import RoomCardImage from "@/components/rooms/RoomCardImage";
import { ROOM_BADGES, normalizeRoomBadges } from "@/lib/roomBadges";

type RoomPreview = {
  id: string;
  code?: string | null;
  type: string;
  price: number;
  address: string;
  cover: string;
  badges?: string[] | null;
};

let preview: RoomPreview | null = null;
let expiry: ReturnType<typeof setTimeout>;
const listeners = new Set<() => void>();
const read = () => preview;
const readServer = () => null;
const cancelOnHistoryChange = () => { if (preview) clearRoomNavigationPreview(preview.id); };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function showRoomNavigationPreview(value: RoomPreview) {
  if (preview?.id === value.id) return false;
  clearTimeout(expiry);
  preview = value;
  listeners.forEach(listener => listener());
  window.addEventListener("popstate", cancelOnHistoryChange);
  expiry = setTimeout(() => clearRoomNavigationPreview(value.id), 5000);
  return true;
}

export function clearRoomNavigationPreview(roomId: string) {
  if (preview?.id !== roomId) return;
  clearTimeout(expiry);
  window.removeEventListener("popstate", cancelOnHistoryChange);
  preview = null;
  listeners.forEach(listener => listener());
}

export function RoomNavigationPreview({ routeLoading = false }: { routeLoading?: boolean }) {
  const room = useSyncExternalStore(subscribe, read, readServer);
  const pathname = usePathname();
  if (!routeLoading && (!room || pathname !== "/")) return null;
  if (!room || (routeLoading && pathname !== `/rooms/${encodeURIComponent(room.id)}`)) return <RoomModalLoadingSkeleton />;

  return (
    <div role="status" aria-label="Đang tải chi tiết phòng" data-room-navigation-preview={room.id} data-home-detail="true"
      className="room-detail-overlay fixed inset-0 z-[99999] flex items-end justify-center bg-black/55 pt-5">
      <div className="room-detail-shell relative flex h-[calc(100dvh-20px)] w-screen flex-col overflow-hidden rounded-t-[28px] border border-white/15 bg-[#392517] text-[#F4E7D6] md:w-[720px] md:max-w-[calc(100vw-48px)]">
        <div className="room-detail-columns relative flex h-full min-h-0 flex-col">
          <div className="room-detail-gallery shrink-0 p-3 pb-2">
            <div className="room-detail-stage relative h-[clamp(300px,35dvh,350px)] overflow-hidden rounded-[18px] bg-black md:h-[400px]">
              {room.cover && (
                <RoomCardImage src={room.cover} alt="" fill unoptimized loading="eager" fetchPriority="high"
                  sizes="(min-width: 1200px) 708px, (min-width: 768px) 720px, 100vw" className="object-contain" />
              )}
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
                {normalizeRoomBadges(room.badges).slice(0, 3).map(id => {
                  const badge = ROOM_BADGES.find(value => value.id === id);
                  return badge && <span key={id} className={`rounded-full px-2 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>;
                })}
              </div>
            </div>
          </div>
          <div className="home-detail-content min-w-0 p-3">
            <div className="space-y-2 rounded-2xl border border-white/15 p-4">
              <p className="font-semibold">{[room.code, room.type].filter(Boolean).join(" · ")}</p>
              {Number.isFinite(Number(room.price)) && <p className="text-xl font-semibold">{Number(room.price).toLocaleString("vi-VN")} đ</p>}
              <p className="break-words">{room.address}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
