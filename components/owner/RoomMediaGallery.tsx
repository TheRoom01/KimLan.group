"use client";

import { useEffect, useState } from "react";

import { readApiResponse } from "@/lib/api/client";

type RoomMedia = {
  id: string;
  type: "image" | "video";
  provider?: string | null;
  url: string;
  path?: string | null;
  is_cover?: boolean | null;
  sort_order?: number | null;
};

type DeleteMediaResult = {
  deleted_media_id: string;
  replacement_cover_id?: string | null;
  object_deleted?: boolean;
  warning?: string | null;
};

export default function RoomMediaGallery({
  media,
  roomId,
  canManage = false,
}: {
  media: RoomMedia[];
  roomId?: string;
  canManage?: boolean;
}) {
  const [items, setItems] = useState<RoomMedia[]>(media ?? []);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setItems(media ?? []);
  }, [media]);

  async function deleteMedia(item: RoomMedia) {
    if (!roomId || !item.id) return;

    const confirmed = window.confirm(
      `Xóa ${item.type === "video" ? "video" : "ảnh"} này khỏi phòng?`,
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(
        `/api/owner/rooms/${roomId}/media/${item.id}`,
        { method: "DELETE" },
      );
      const result = await readApiResponse<DeleteMediaResult>(response);

      setItems((current) =>
        current
          .filter((mediaItem) => mediaItem.id !== result.deleted_media_id)
          .map((mediaItem) => ({
            ...mediaItem,
            is_cover:
              result.replacement_cover_id === mediaItem.id
                ? true
                : item.is_cover
                  ? false
                  : mediaItem.is_cover,
          })),
      );

      if (result.warning) {
        setWarning(
          "Đã xóa media khỏi dữ liệu phòng nhưng object R2 chưa được dọn. Có thể chạy cleanup sau.",
        );
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Không thể xóa media",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-6 text-gray-500">
        Chưa có hình ảnh hoặc video phòng.
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Hình ảnh / Video phòng</h2>
        <span className="text-sm text-gray-500">{items.length} media</span>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {warning ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {warning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-lg border bg-gray-50"
          >
            {item.type === "video" ? (
              <video
                src={item.url}
                controls
                preload="metadata"
                className="h-48 w-full bg-black object-contain"
              />
            ) : (
              <img
                src={item.url}
                alt={`Ảnh phòng ${index + 1}`}
                loading="lazy"
                className="h-48 w-full object-cover"
              />
            )}

            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-xs font-medium text-gray-600">
                {item.is_cover
                  ? "Ảnh đại diện"
                  : item.type === "video"
                    ? "Video"
                    : `Ảnh ${index + 1}`}
              </span>

              {canManage && roomId ? (
                <button
                  type="button"
                  onClick={() => void deleteMedia(item)}
                  disabled={deletingId === item.id}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === item.id ? "Đang xóa..." : "Xóa"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
