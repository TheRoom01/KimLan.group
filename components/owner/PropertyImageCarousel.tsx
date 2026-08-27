"use client";

import { ChevronLeft, ChevronRight, ImageIcon, Maximize2, X } from "lucide-react";
import { PointerEvent, useRef, useState } from "react";

export default function PropertyImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const thumbs = useRef<HTMLDivElement>(null);
  const thumbDrag = useRef<{ x: number; scrollLeft: number } | null>(null);

  function show(index: number) {
    if (!images.length) return;
    setActive((index + images.length) % images.length);
  }

  function startMain(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientX;
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMain(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    if (Math.abs(event.clientX - dragStart.current) > 8) dragged.current = true;
  }

  function endMain(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const distance = event.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(distance) >= 45) show(active + (distance < 0 ? 1 : -1));
  }

  function startThumbDrag(event: PointerEvent<HTMLDivElement>) {
    if (!thumbs.current) return;
    thumbDrag.current = { x: event.clientX, scrollLeft: thumbs.current.scrollLeft };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveThumbDrag(event: PointerEvent<HTMLDivElement>) {
    if (!thumbDrag.current || !thumbs.current) return;
    const distance = event.clientX - thumbDrag.current.x;
    if (Math.abs(distance) > 6) dragged.current = true;
    thumbs.current.scrollLeft = thumbDrag.current.scrollLeft - distance;
  }

  function endThumbDrag() {
    thumbDrag.current = null;
  }

  if (!images.length) {
    return <div className="flex aspect-[16/10] w-full min-w-0 max-w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#eadbc8] text-[#98785b]"><ImageIcon size={32} /><span className="text-sm">Chưa có ảnh tòa nhà</span></div>;
  }

  return (
    <div className="min-w-0 max-w-full select-none">
      <div
        className="relative aspect-[16/10] touch-pan-y cursor-grab overflow-hidden rounded-2xl bg-[#eadbc8] active:cursor-grabbing"
        onPointerDown={startMain}
        onPointerMove={moveMain}
        onPointerUp={endMain}
        onPointerCancel={() => { dragStart.current = null; }}
        onClick={() => { if (!dragged.current) setFullscreen(true); }}
      >
        <img src={images[active]} alt={`${title} - ảnh ${active + 1}`} draggable={false} className="pointer-events-none h-full w-full object-cover" />
        <span className="absolute right-3 top-3 rounded-full bg-[#2b1a10]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"><ImageIcon className="mr-1 inline" size={14} /> {active + 1}/{images.length}</span>
        {images.length > 1 ? <>
          <button type="button" onClick={(event) => { event.stopPropagation(); show(active - 1); }} aria-label="Ảnh trước" className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fff9ef]/90 text-[#684324] shadow transition hover:bg-white"><ChevronLeft size={19} /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); show(active + 1); }} aria-label="Ảnh tiếp theo" className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fff9ef]/90 text-[#684324] shadow transition hover:bg-white"><ChevronRight size={19} /></button>
        </> : null}
        <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-[#2b1a10]/70 text-white"><Maximize2 size={17} /></span>
      </div>
      {images.length > 1 ? (
        <div ref={thumbs} onPointerDown={startThumbDrag} onPointerMove={moveThumbDrag} onPointerUp={endThumbDrag} onPointerCancel={endThumbDrag} className="mt-3 flex w-full min-w-0 max-w-full touch-pan-y cursor-grab gap-2 overflow-x-auto pb-1 active:cursor-grabbing [scrollbar-width:thin]">
          {images.map((image, index) => <button key={image} type="button" onClick={() => { if (!dragged.current) show(index); }} className={`aspect-[4/3] w-[72px] shrink-0 overflow-hidden rounded-xl border-2 transition ${index === active ? "border-[#744722] shadow-sm" : "border-transparent opacity-80 hover:opacity-100"}`} aria-label={`Xem ảnh ${index + 1}`}><img src={image} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" /></button>)}
        </div>
      ) : null}
      {fullscreen ? <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Xem ảnh toàn màn hình" onClick={() => setFullscreen(false)}>
        <button type="button" onClick={() => setFullscreen(false)} className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25" aria-label="Đóng ảnh toàn màn hình"><X size={24} /></button>
        <img src={images[active]} alt={`${title} - ảnh ${active + 1}`} draggable={false} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
        {images.length > 1 ? <>
          <button type="button" onClick={(event) => { event.stopPropagation(); show(active - 1); }} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Ảnh trước"><ChevronLeft size={25} /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); show(active + 1); }} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Ảnh tiếp theo"><ChevronRight size={25} /></button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">{active + 1}/{images.length}</span>
        </> : null}
      </div> : null}
    </div>
  );
}
