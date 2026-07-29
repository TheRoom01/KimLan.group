"use client";

import { DragEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImageIcon, Save, Trash2 } from "lucide-react";
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
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    setItems(media ?? []);
    setOrderDirty(false);
  }, [media]);

  function moveItem(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    setItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setOrderDirty(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (draggedId) moveItem(draggedId, targetId);
    setDraggedId(null);
  }

  function moveByIndex(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    moveItem(items[index].id, items[targetIndex].id);
  }

  async function saveOrder() {
    if (!roomId || !orderDirty) return;

    setSavingOrder(true);
    setError(null);
    try {
      const response = await fetch(`/api/owner/rooms/${roomId}/media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item, index) => ({
            id: item.id,
            sort_order: index,
          })),
          cover_id: items.find((item) => item.type === "image")?.id ?? null,
        }),
      });
      const updated = await readApiResponse<RoomMedia[]>(response);
      setItems(updated);
      setOrderDirty(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu thứ tự ảnh",
      );
    } finally {
      setSavingOrder(false);
    }
  }

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
          .map((mediaItem, index) => ({
            ...mediaItem,
            sort_order: index,
            is_cover:
              result.replacement_cover_id === mediaItem.id
                ? true
                : item.is_cover
                  ? false
                  : mediaItem.is_cover,
          })),
      );
      setOrderDirty(false);

      if (result.warning) {
        setWarning(
          "Đã xóa media khỏi dữ liệu phòng nhưng object R2 chưa được dọn.",
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
      <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-6 text-sm text-[#80634a]">
        Chưa có hình ảnh hoặc video phòng.
      </div>
    );
  }

  return (
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon size={20} className="text-[#744722]" />
            <h2 className="text-lg font-bold text-[#4f321e]">Hình ảnh / Video phòng</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#846951]">
            Kéo thả để đổi thứ tự. Ảnh đầu tiên sẽ được ưu tiên làm ảnh nhận diện trong card.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#ead3b3] px-2.5 py-1 text-xs font-semibold text-[#684324]">
            {items.length} media
          </span>
          {canManage && orderDirty ? (
            <button
              type="button"
              onClick={() => void saveOrder()}
              disabled={savingOrder}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#744722] px-3 text-xs font-semibold text-[#fff8eb] transition hover:bg-[#623817] disabled:opacity-50"
            >
              <Save size={14} />
              {savingOrder ? "Đang lưu..." : "Lưu thứ tự"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {warning ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {warning}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <article
            key={item.id}
            draggable={canManage}
            onDragStart={() => canManage && setDraggedId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => canManage && handleDrop(event, item.id)}
            className={`overflow-hidden rounded-2xl border bg-[#f8ead7] transition ${
              draggedId === item.id
                ? "border-[#744722] opacity-60"
                : "border-[#aa825d]/20"
            }`}
          >
            {item.type === "video" ? (
              <video
                src={item.url}
                controls
                preload="metadata"
                className="h-36 w-full bg-[#2b1a10] object-contain sm:h-48"
              />
            ) : (
              <img
                src={item.url}
                alt={`Ảnh phòng ${index + 1}`}
                loading="lazy"
                className="h-36 w-full object-cover sm:h-48"
              />
            )}

            <div className="flex items-center justify-between gap-2 px-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {canManage ? (
                  <span
                    className="cursor-grab text-[#9b7655] active:cursor-grabbing"
                    title="Kéo để sắp xếp"
                    aria-label="Kéo để sắp xếp"
                  >
                    <GripVertical size={17} />
                  </span>
                ) : null}
                <span className="truncate text-xs font-semibold text-[#5f4631]">
                  {item.is_cover
                    ? "Ảnh đại diện"
                    : item.type === "video"
                      ? "Video"
                      : `Ảnh ${index + 1}`}
                </span>
              </div>

              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveByIndex(index, -1)}
                    disabled={index === 0}
                    className="grid h-7 w-7 place-items-center rounded-md text-[#76573e] hover:bg-[#eadbc8] disabled:opacity-30"
                    aria-label="Đưa ảnh lên"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveByIndex(index, 1)}
                    disabled={index === items.length - 1}
                    className="grid h-7 w-7 place-items-center rounded-md text-[#76573e] hover:bg-[#eadbc8] disabled:opacity-30"
                    aria-label="Đưa ảnh xuống"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMedia(item)}
                    disabled={deletingId === item.id}
                    className="grid h-7 w-7 place-items-center rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"
                    aria-label="Xóa media"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
