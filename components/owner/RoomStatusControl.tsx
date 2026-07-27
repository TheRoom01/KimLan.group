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

  async function updateStatus() {
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
          body: JSON.stringify({ status }),
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
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as RoomStatus)
          }
          disabled={loading}
          className="rounded-lg border px-3 py-2"
        >
          {ROOM_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={updateStatus}
          disabled={loading || status === initialStatus}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Lưu..." : "Đổi trạng thái"}
        </button>
      </div>

      {errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
