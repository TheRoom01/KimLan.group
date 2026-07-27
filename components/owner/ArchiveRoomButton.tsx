"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

export default function ArchiveRoomButton({
  roomId,
  propertyId,
}: {
  roomId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archiveRoom() {
    const confirmed = window.confirm(
      "Lưu trữ phòng này? Phòng sẽ bị ẩn công khai nhưng media và lịch sử hợp đồng vẫn được giữ.",
    );

    if (!confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/owner/rooms/${roomId}`, {
        method: "DELETE",
      });
      await readApiResponse<unknown>(response);
      router.push(`/owner/properties/${propertyId}`);
      router.refresh();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Không thể lưu trữ phòng",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void archiveRoom()}
        disabled={submitting}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Đang lưu trữ..." : "Lưu trữ phòng"}
      </button>
      {error ? <p className="mt-2 max-w-xs text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
