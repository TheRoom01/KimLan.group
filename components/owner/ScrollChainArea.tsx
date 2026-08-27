"use client";

import { TouchEvent, WheelEvent, useRef } from "react";

export default function ScrollChainArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const lastTouchY = useRef<number | null>(null);

  function reachedEdge(element: HTMLDivElement, deltaY: number) {
    const atTop = element.scrollTop <= 0;
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
  }

  function chainWheel(event: WheelEvent<HTMLDivElement>) {
    if (!reachedEdge(event.currentTarget, event.deltaY)) return;
    event.preventDefault();
    window.scrollBy({ top: event.deltaY, behavior: "auto" });
  }

  function startTouch(event: TouchEvent<HTMLDivElement>) {
    lastTouchY.current = event.touches[0]?.clientY ?? null;
  }

  function chainTouch(event: TouchEvent<HTMLDivElement>) {
    const currentY = event.touches[0]?.clientY;
    const previousY = lastTouchY.current;
    if (currentY == null || previousY == null) return;

    const deltaY = previousY - currentY;
    lastTouchY.current = currentY;
    if (!reachedEdge(event.currentTarget, deltaY)) return;

    event.preventDefault();
    window.scrollBy({ top: deltaY, behavior: "auto" });
  }

  return (
    <div
      className={className}
      onWheel={chainWheel}
      onTouchStart={startTouch}
      onTouchMove={chainTouch}
      onTouchEnd={() => { lastTouchY.current = null; }}
      onTouchCancel={() => { lastTouchY.current = null; }}
    >
      {children}
    </div>
  );
}
