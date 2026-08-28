"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, ImageIcon, Maximize, Minimize, Play, Save, Trash2, X } from "lucide-react";
import { readApiResponse } from "@/lib/api/client";
import { useDirectSwipeCarousel } from "@/components/media/useDirectSwipeCarousel";
import RoomMediaVideo from "@/components/media/RoomMediaVideo";

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
  const [activeId, setActiveId] = useState<string | null>(media?.[0]?.id ?? null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mediaControlsVisible, setMediaControlsVisible] = useState(true);
  const normalVideoRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaControlsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setItems(media ?? []);
    setActiveId(media?.[0]?.id ?? null);
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
      if (activeId === item.id) {
        setActiveId(items.find((candidate) => candidate.id !== item.id)?.id ?? null);
      }
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

  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
  const activeItem = items[activeIndex] as RoomMedia;
  function showMediaControlsTemporarily() {
    setMediaControlsVisible(true);
    if (mediaControlsTimerRef.current) window.clearTimeout(mediaControlsTimerRef.current);
    mediaControlsTimerRef.current = window.setTimeout(() => {
      setMediaControlsVisible(false);
      mediaControlsTimerRef.current = null;
    }, 1000);
  }

  function handleMediaPlaybackChange(isPlaying: boolean) {
    setMediaControlsVisible(true);
    if (mediaControlsTimerRef.current) {
      window.clearTimeout(mediaControlsTimerRef.current);
      mediaControlsTimerRef.current = null;
    }
    if (isPlaying) {
      mediaControlsTimerRef.current = window.setTimeout(() => {
        setMediaControlsVisible(false);
        mediaControlsTimerRef.current = null;
      }, 1000);
    }
  }

  const swipe = useDirectSwipeCarousel({ count: items.length, index: activeIndex, onIndexChange: (nextIndex) => setActiveId(items[nextIndex]?.id ?? null), loop: false, onInteraction: () => { normalVideoRef.current?.pause(); showMediaControlsTemporarily(); } });
  const fullscreenSwipe = useDirectSwipeCarousel({ count: items.length, index: activeIndex, onIndexChange: (nextIndex) => setActiveId(items[nextIndex]?.id ?? null), loop: false, onInteraction: () => { fullscreenVideoRef.current?.pause(); showMediaControlsTemporarily(); } });

  function openFullscreen() {
    normalVideoRef.current?.pause();
    showMediaControlsTemporarily();
    setFullscreen(true);
  }

  function closeFullscreen() {
    fullscreenVideoRef.current?.pause();
    setFullscreen(false);
  }

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      fullscreenVideoRef.current?.pause();
      setFullscreen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [fullscreen]);

  useEffect(() => () => {
    if (mediaControlsTimerRef.current) window.clearTimeout(mediaControlsTimerRef.current);
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    [-2, -1, 1, 2]
      .map((offset) => items[(activeIndex + offset + items.length) % items.length])
      .filter((item) => item?.type === "image")
      .forEach((item) => {
        const preload = new window.Image();
        preload.src = item.url;
        void preload.decode?.().catch(() => undefined);
      });
  }, [activeIndex, items]);

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

      <div className="group relative min-w-0 touch-pan-y select-none overflow-hidden rounded-2xl border border-[#aa825d]/20 bg-[#2b1a10]" {...swipe.bind}>
        <div className={`flex h-full w-full will-change-transform ${swipe.isAnimating ? "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" : ""}`} style={{ transform: swipe.transform }} onTransitionEnd={() => { if (!fullscreen) swipe.onTransitionEnd(); }}>
          {swipe.visibleIndexes.map((mediaIndex, slot) => {
            const item = items[mediaIndex];
            const isCurrent = mediaIndex === activeIndex;
            return <div key={`${item.id}-${slot}`} className="relative flex aspect-[4/3] max-h-[360px] w-full shrink-0 items-center justify-center bg-[#2b1a10]">
              {item.type === "video" ? <RoomMediaVideo ref={isCurrent ? normalVideoRef : undefined} src={item.url} active={isCurrent} swipeEnabled={items.length > 1} onPlaybackChange={handleMediaPlaybackChange} className="h-full w-full object-contain" /> : <div role="button" tabIndex={isCurrent ? 0 : -1} aria-label="Xem media toàn màn hình" onClick={() => { if (!swipe.consumeClickSuppression()) openFullscreen(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFullscreen(); } }} className="block h-full w-full cursor-zoom-in"><img src={item.url} alt="Media phòng đang xem" draggable={false} className="pointer-events-none h-full w-full select-none object-contain" /></div>}
            </div>;
          })}
        </div>
        {mediaControlsVisible ? <span className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{activeIndex + 1} / {items.length}</span> : null}
        {activeItem.type === "video" ? <button type="button" data-swipe-ignore="true" onClick={(event) => { event.stopPropagation(); openFullscreen(); }} aria-label="Mở media toàn màn hình" title="Toàn màn hình" className="absolute right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/50 text-white shadow-lg backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Maximize size={20} /></button> : null}
        {mediaControlsVisible && items.length > 1 ? <>
          <button type="button" data-swipe-ignore="true" onClick={() => swipe.move(-1)} disabled={activeIndex === 0} aria-label="Media trước" className="absolute left-3 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-25"><ChevronLeft size={22} /></button>
          <button type="button" data-swipe-ignore="true" onClick={() => swipe.move(1)} disabled={activeIndex === items.length - 1} aria-label="Media tiếp theo" className="absolute right-3 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-25"><ChevronRight size={22} /></button>
        </> : null}
      </div>

      <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2 touch-pan-x">
        {items.map((item, index) => (
          <article
            key={item.id}
            draggable={canManage}
            onDragStart={() => canManage && setDraggedId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => canManage && handleDrop(event, item.id)}
            onClick={() => swipe.jumpTo(index)}
            className={`relative w-24 shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-[#f8ead7] transition ${
              draggedId === item.id
                ? "border-[#744722] opacity-60"
                : activeItem.id === item.id ? "border-[#744722]" : "border-transparent"
            }`}
          >
            {item.type === "video" ? (
              <div className="relative h-20 w-full bg-[#2b1a10]">
                <video src={item.url} muted playsInline preload="none" className="pointer-events-none h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center text-white"><span className="grid h-8 w-8 place-items-center rounded-full bg-black/55"><Play size={15} fill="currentColor" /></span></span>
              </div>
            ) : (
              <img
                src={item.url}
                alt={`Ảnh phòng ${index + 1}`}
                loading="lazy"
                draggable={false}
                className="h-20 w-full select-none object-cover"
              />
            )}

            <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
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
                    onClick={() => void deleteMedia(item)}
                    disabled={deletingId === item.id}
                    className="grid h-6 w-6 place-items-center rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"
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
      {fullscreen ? <div className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-[14px]" role="dialog" aria-modal="true" aria-label="Xem media phòng toàn màn hình" onClick={closeFullscreen}>
  <div className="relative flex h-full w-full cursor-grab select-none items-center justify-center active:cursor-grabbing" {...fullscreenSwipe.bind} onClick={(event) => event.stopPropagation()} style={{ touchAction: "none" }}>
  <div className={`flex h-full w-full will-change-transform ${fullscreenSwipe.isAnimating ? "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" : ""}`} style={{ transform: fullscreenSwipe.transform }} onTransitionEnd={fullscreenSwipe.onTransitionEnd}>
    {fullscreenSwipe.visibleIndexes.map((mediaIndex) => {
      const item = items[mediaIndex];
      const isCurrent = mediaIndex === activeIndex;
      return <div key={`fullscreen-${item.id}`} className="relative flex h-full w-full shrink-0 items-center justify-center bg-black">
        {item.type === "image" ? <img src={item.url} alt={`Ảnh ${mediaIndex + 1}`} draggable={false} loading={isCurrent ? "eager" : "lazy"} fetchPriority={isCurrent ? "high" : "auto"} className="h-full w-full select-none object-contain" /> : <RoomMediaVideo ref={isCurrent ? fullscreenVideoRef : undefined} src={item.url} active={isCurrent} swipeEnabled={items.length > 1} fullscreen onPlaybackChange={handleMediaPlaybackChange} className="h-full w-full object-contain" />}
      </div>;
    })}
  </div>

  <button type="button" data-swipe-ignore="true" onClick={closeFullscreen} aria-label="Đóng toàn màn hình" className="absolute right-4 top-4 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-[24px] transition hover:bg-white/20">
    <X size={22} />
  </button>
  <button type="button" data-swipe-ignore="true" onClick={closeFullscreen} aria-label="Thoát toàn màn hình" title="Thoát toàn màn hình" className="absolute right-4 top-16 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-[24px] transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
    <Minimize size={21} />
  </button>

  {mediaControlsVisible && items.length > 1 ? <>
    <button type="button" data-swipe-ignore="true" onClick={() => fullscreenSwipe.move(-1)} disabled={activeIndex === 0} aria-label="Media trước" className="absolute left-4 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-[24px] transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-25"><ChevronLeft size={28} /></button>
    <button type="button" data-swipe-ignore="true" onClick={() => fullscreenSwipe.move(1)} disabled={activeIndex === items.length - 1} aria-label="Media tiếp theo" className="absolute right-4 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-[24px] transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-25"><ChevronRight size={28} /></button>
  </> : null}
  {mediaControlsVisible ? <span className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">{activeIndex + 1} / {items.length}</span> : null}
</div>
</div> : null}
    </section>
  );
}
