"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import RoomCard from "@/components/owner/RoomCard";
import {
  clampOwnerRoomCardSize,
  DEFAULT_OWNER_ROOM_CARD_SIZE,
  OWNER_ROOM_CARD_SIZE_STORAGE_KEY,
  type OwnerRoomCardSizes,
} from "@/lib/owner/roomCardSizing";
import type { OwnerTenantReference } from "@/lib/owner/types";
import { showOwnerNavigationSkeleton } from "@/lib/owner/clientExperience";

type PropertyRoom = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  status?: string | null;
  displayStatus?: string | null;
  contract?: {
    id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  tenants?: OwnerTenantReference[] | null;
};

export default function PropertyRoomCardGrid({ rooms }: { rooms: PropertyRoom[] }) {
  const router = useRouter();
  const [cardSizes, setCardSizes] = useState<OwnerRoomCardSizes>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(OWNER_ROOM_CARD_SIZE_STORAGE_KEY) || "{}",
      ) as OwnerRoomCardSizes;
      setCardSizes(
        Object.fromEntries(
          Object.entries(saved).map(([id, size]) => [
            id,
            clampOwnerRoomCardSize(size),
          ]),
        ),
      );
    } catch {
      setCardSizes({});
    }
  }, []);

  useEffect(() => {
    rooms.forEach((room) => {
      router.prefetch(`/owner/rooms/${room.id}`);
    });
  }, [rooms, router]);

  return (
    <div className="mt-5 flex flex-wrap items-start gap-2.5">
      {rooms.map((room) => {
        const size = cardSizes[room.id] || DEFAULT_OWNER_ROOM_CARD_SIZE;
        return (
          <div
            key={room.id}
            data-property-room-id={room.id}
            style={{ width: `min(100%, ${size.width}px)`, minHeight: size.height }}
            className="relative max-w-full shrink-0"
          >
            <RoomCard
              room={room}
              expanded={false}
              resizeMode={false}
              width={size.width}
              height={size.height}
              showDragHandle={false}
              onToggle={() => { showOwnerNavigationSkeleton(); router.push(`/owner/rooms/${room.id}`); }}
              onResize={() => undefined}
              onResizeEnd={() => undefined}
              onResizeDone={() => undefined}
              onDragHandlePointerDown={() => undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
