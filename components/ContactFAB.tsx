"use client";

import { useEffect, useRef, useState } from "react";

type Pos = { x: number; y: number };

function PhoneSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z" />
    </svg>
  );
}

export default function ContactFAB() {
  const [open, setOpen] = useState(false);

  const PHONE = "0967467587";
const ZALO = "https://zalo.me/0772339345";
const MESSENGER = "https://www.facebook.com/duongkimlan001";


  // ===== draggable FAB =====
  const FAB_KEY = "contact_fab_pos";
  const FAB_SIZE = 56; // h-14
  const MARGIN = 8;

  const [pos, setPos] = useState<Pos | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fabBtnRef = useRef<HTMLButtonElement | null>(null);

  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const downPt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moved = useRef(false);

  const clamp = (x: number, y: number): Pos => {
    const maxX = window.innerWidth - FAB_SIZE - MARGIN;
    const maxY = window.innerHeight - FAB_SIZE - MARGIN;
    return {
      x: Math.min(Math.max(MARGIN, x), maxX),
      y: Math.min(Math.max(MARGIN, y), maxY),
    };
  };

   // load pos
  useEffect(() => {
    let saved: string | null = null;

    try {
      saved = localStorage.getItem(FAB_KEY);
    } catch {}

    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPos(clamp(p.x, p.y));
        return;
      } catch {}
    }

    setPos(
      clamp(
        window.innerWidth - FAB_SIZE - MARGIN,
        window.innerHeight - FAB_SIZE - 120
      )
    );
  }, []);

  // save pos
  useEffect(() => {
    if (!pos) return;
    try {
      localStorage.setItem(FAB_KEY, JSON.stringify(pos));
    } catch {}
  }, [pos]);

  // click outside => close (CAPTURE)
 useEffect(() => {
  if (!open) return;

  const onDocDown = (e: PointerEvent) => {
    const t = e.target as Node | null;
    const wrap = wrapperRef.current;
    if (wrap && t && wrap.contains(t)) return; // click trong FAB => không đóng
    setOpen(false);
  };

  document.addEventListener("pointerdown", onDocDown, { capture: true });
  return () => document.removeEventListener("pointerdown", onDocDown, true as any);
}, [open]);


  // drag on FAB button only
  useEffect(() => {
    if (!pos) return;
    const el = fabBtnRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      moved.current = false;
      downPt.current = { x: e.clientX, y: e.clientY };

      // khi bắt đầu kéo, đóng menu để khỏi vướng
      el.setPointerCapture(e.pointerId);
      offset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    };

    const onMove = (e: PointerEvent) => {
  if (!dragging.current) return;

  const dx = e.clientX - downPt.current.x;
  const dy = e.clientY - downPt.current.y;

  if (!moved.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    moved.current = true;
    setOpen(false); // ✅ chỉ đóng khi đã thật sự kéo
  }

  setPos(clamp(e.clientX - offset.current.x, e.clientY - offset.current.y));
};


    const onUp = () => {
      dragging.current = false;
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pos]);

  if (!pos) return null;

  return (
            <div
        ref={wrapperRef}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[2147483647] flex flex-col items-center gap-3 touch-none"
        >

 {open && (
   <>
    <a
      href={`tel:${PHONE}`}
      className="h-11 w-11 rounded-full flex items-center justify-center ring-8 ring-emerald-400/60 bg-white/70"
      aria-label="Gọi điện"
    >
      <span className="text-[32px] leading-none">📞</span>
    </a>

    <a
      href={ZALO}
      target="_blank"
      rel="noreferrer"
      className="h-11 w-11 rounded-full flex items-center justify-center ring-8 ring-emerald-400/60 bg-white/70 text-blue-600 border shadow"
      title="Zalo"
    >
      Zalo
    </a>

    <a
      href={MESSENGER}
      target="_blank"
      rel="noreferrer"
      className="h-11 w-11 rounded-full flex items-center justify-center ring-8 ring-emerald-400/60 bg-white/70"
      aria-label="Messenger"
     >
      <svg
        viewBox="0 0 48 48"
        className="h-11 w-11"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="messengerGradient_fab" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00C6FF" />
            <stop offset="50%" stopColor="#0078FF" />
            <stop offset="100%" stopColor="#A033FF" />
          </linearGradient>
        </defs>

        <path
          fill="url(#messengerGradient_fab)"
          d="M24 4C13.5 4 5 11.9 5 21.7c0 5.6 2.9 10.5 7.6 13.7v8.6l8.3-4.6c1.1.2 2.1.3 3.2.3 10.5 0 19-7.9 19-17.7S34.5 4 24 4z"
        />
        <path
          fill="#fff"
          d="M14.5 26.9l6.2-6.6 5.2 4 6.8-4-6.2 6.6-5.2-4z"
        />
      </svg>
    </a>
   </>
  )}

      <button
        ref={fabBtnRef}
        onClick={(e) => {
          // chặn “click rác” sau khi drag
          if (moved.current) {
            moved.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          setOpen((v) => !v);
        }}
        className="
          h-14 w-[120px]
          shrink-0 whitespace-nowrap
          rounded-full
          bg-red-600/60 hover:bg-red-600/80
          text-white
          flex items-center justify-center
          shadow-xl
        "
      >
        Liên hệ Admin
      </button>
    </div>
  );
}
