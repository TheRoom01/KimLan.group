"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";
import {
  ROOM_STATUSES,
  normalizeRoomStatus,
  type RoomStatus,
} from "@/lib/owner/types";

export default function RoomStatusControl({
  roomId,
  currentStatus,
}: {
  roomId: string;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const initialStatus = normalizeRoomStatus(currentStatus) ?? "Đang trống";
  const [status, setStatus] = useState<RoomStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function updateStatus(nextStatus: RoomStatus) {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(
        `/api/owner/rooms/${roomId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      await readApiResponse(response);
      router.refresh();
    } catch (error) {
      setStatus(initialStatus);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Đổi trạng thái phòng thất bại",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center">
        <select
          value={status}
          onChange={(event) => {
            const nextStatus = event.target.value as RoomStatus;
            setStatus(nextStatus);
            void updateStatus(nextStatus);
          }}
          disabled={loading}
          className="h-8 min-w-0 rounded-lg border border-[#aa825d]/30 bg-white px-2 text-xs font-semibold text-[#4d3422] disabled:opacity-60"
        >
          {ROOM_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

      </div>

      {errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
