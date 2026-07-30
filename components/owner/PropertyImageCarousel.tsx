"use client";

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { PointerEvent, useRef, useState } from "react";

export default function PropertyImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
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
    return <div className="flex aspect-[16/10] h-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#eadbc8] text-[#98785b]"><ImageIcon size={32} /><span className="text-sm">Chưa có ảnh tòa nhà</span></div>;
  }

  return (
    <div className="select-none">
      <div
        className="relative aspect-[16/10] touch-pan-y cursor-grab overflow-hidden rounded-2xl bg-[#eadbc8] active:cursor-grabbing"
        onPointerDown={startMain}
        onPointerMove={moveMain}
        onPointerUp={endMain}
        onPointerCancel={() => { dragStart.current = null; }}
      >
        <img src={images[active]} alt={`${title} - ảnh ${active + 1}`} draggable={false} className="pointer-events-none h-full w-full object-cover" />
        <span className="absolute right-3 top-3 rounded-full bg-[#2b1a10]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"><ImageIcon className="mr-1 inline" size={14} /> {active + 1}/{images.length}</span>
        {images.length > 1 ? <>
          <button type="button" onClick={() => show(active - 1)} aria-label="Ảnh trước" className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fff9ef]/90 text-[#684324] shadow transition hover:bg-white"><ChevronLeft size={19} /></button>
          <button type="button" onClick={() => show(active + 1)} aria-label="Ảnh tiếp theo" className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-[#fff9ef]/90 text-[#684324] shadow transition hover:bg-white"><ChevronRight size={19} /></button>
        </> : null}
      </div>
      {images.length > 1 ? (
        <div ref={thumbs} onPointerDown={startThumbDrag} onPointerMove={moveThumbDrag} onPointerUp={endThumbDrag} onPointerCancel={endThumbDrag} className="mt-3 flex touch-pan-y cursor-grab gap-2 overflow-x-auto pb-1 active:cursor-grabbing [scrollbar-width:thin]">
          {images.map((image, index) => <button key={image} type="button" onClick={() => { if (!dragged.current) show(index); }} className={`aspect-[4/3] w-[72px] shrink-0 overflow-hidden rounded-xl border-2 transition ${index === active ? "border-[#744722] shadow-sm" : "border-transparent opacity-80 hover:opacity-100"}`} aria-label={`Xem ảnh ${index + 1}`}><img src={image} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" /></button>)}
        </div>
      ) : null}
    </div>
  );
}
