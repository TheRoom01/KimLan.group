"use client";

import { useEffect, useState } from "react";
import type { NearbyRoomCenter } from "@/lib/rooms/naturalSearch";

type Room = { id: string; address: string; room_type: string; price: number; distance_km: number };
const PAGE_SIZE = 20;

export default function NearbyHomeRooms({ center, filters }: { center: NearbyRoomCenter; filters: string }) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(filters);
    const latitudeSpan = 5 / 110;
    const longitudeSpan = latitudeSpan / Math.cos(center.latitude * Math.PI / 180);
    params.set("lat", String(center.latitude));
    params.set("lng", String(center.longitude));
    params.set("radius", "5");
    params.set("west", String(center.longitude - longitudeSpan));
    params.set("east", String(center.longitude + longitudeSpan));
    params.set("south", String(center.latitude - latitudeSpan));
    params.set("north", String(center.latitude + latitudeSpan));
    fetch(`/api/map/rooms?${params}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Nearby rooms unavailable");
        const result = await response.json();
        setRooms(result.rooms);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [center, filters]);

  return (
    <section className="home-filter mx-auto max-w-[1440px] px-4 py-4" aria-label="Phòng trong bán kính 5 km">
      <h2 className="text-lg font-semibold">Trong 5 km quanh {center.label}</h2>
      {error ? <p role="status">Không thể tải phòng theo khoảng cách.</p> : rooms === null
        ? <p role="status">Đang tìm phòng gần địa điểm…</p> : rooms.length === 0
          ? <p>Không có phòng có tọa độ phù hợp.</p> : (
            <>
              <ul data-home-filter-scroll-target className="my-3 grid gap-2 md:grid-cols-2">
                {rooms.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(room => (
                  <li key={room.id} className="rounded-xl border border-current/20 p-3">
                    <a href={`/rooms/${encodeURIComponent(room.id)}`}>
                      <strong>{room.room_type}</strong> · {room.price?.toLocaleString("vi-VN")} ₫ · {room.distance_km.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} km
                      <div>{room.address}</div>
                    </a>
                  </li>
                ))}
              </ul>
              <nav aria-label="Phân trang phòng gần địa điểm" className="flex gap-4 pb-4">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
                <span>Trang {page + 1}</span>
                <button type="button" disabled={(page + 1) * PAGE_SIZE >= rooms.length} onClick={() => setPage(page + 1)}>Sau</button>
              </nav>
            </>
          )}
    </section>
  );
}
