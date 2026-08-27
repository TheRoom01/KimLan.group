"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Direction = -1 | 1;

type Options = {
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  loop?: boolean;
  onInteraction?: () => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  axis: "pending" | "horizontal" | "vertical";
};

/**
 * Direct-track carousel: every media node keeps a stable position in the DOM.
 * Index changes happen as soon as a gesture completes, so navigation never
 * waits for image decoding or transitionEnd before accepting another action.
 */
export function useDirectSwipeCarousel({ count, index, onIndexChange, loop = false, onInteraction }: Options) {
  const [dragX, setDragX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const pendingDragXRef = useRef(0);

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  const resolveIndex = useCallback((candidate: number) => {
    if (count <= 0) return 0;
    if (loop) return (candidate + count) % count;
    return Math.min(Math.max(candidate, 0), count - 1);
  }, [count, loop]);

  const scheduleDragX = useCallback((value: number) => {
    pendingDragXRef.current = value;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setDragX(pendingDragXRef.current);
    });
  }, []);

  const move = useCallback((direction: Direction) => {
    if (count < 2) return false;
    const nextIndex = resolveIndex(index + direction);
    if (nextIndex === index) return false;
    cancelFrame();
    onInteraction?.();
    setDragX(0);
    setIsAnimating(true);
    onIndexChange(nextIndex);
    return true;
  }, [cancelFrame, count, index, onIndexChange, onInteraction, resolveIndex]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (count < 2) return;
    if ((event.target as HTMLElement)?.closest?.("button, a, input, select, textarea, video, [data-swipe-ignore='true']")) return;
    cancelFrame();
    setIsAnimating(false);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      axis: "pending",
    };
    suppressClickRef.current = false;
    onInteraction?.();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [cancelFrame, count, onInteraction]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.axis === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 6) {
      drag.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (drag.axis !== "horizontal") return;
    const now = performance.now();
    const instantVelocity = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastAt);
    drag.velocityX = drag.velocityX * 0.65 + instantVelocity * 0.35;
    drag.lastX = event.clientX;
    drag.lastAt = now;
    if (Math.abs(deltaX) > 5) suppressClickRef.current = true;
    const pastEdge = !loop && ((index === 0 && deltaX > 0) || (index === count - 1 && deltaX < 0));
    scheduleDragX(pastEdge ? deltaX * 0.18 : deltaX);
  }, [count, index, loop, scheduleDragX]);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    cancelFrame();
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    const distance = drag.lastX - drag.startX;
    const verticalDistance = event.clientY - drag.startY;
    const direction: Direction = distance < 0 ? 1 : -1;
    const width = Math.max(1, event.currentTarget.getBoundingClientRect().width);
    const threshold = Math.min(88, Math.max(38, width * 0.13));
    const shouldMove = !cancelled && drag.axis === "horizontal" && Math.abs(distance) > Math.abs(verticalDistance) && (Math.abs(distance) >= threshold || Math.abs(drag.velocityX) >= 0.3);
    setDragX(0);
    if (shouldMove && move(direction)) return;
    if (Math.abs(distance) > 0.5) setIsAnimating(true);
  }, [cancelFrame, move]);

  const jumpTo = useCallback((nextIndex: number) => {
    if (count <= 0) return;
    const resolved = resolveIndex(nextIndex);
    if (resolved === index) return;
    cancelFrame();
    onInteraction?.();
    setDragX(0);
    setIsAnimating(true);
    onIndexChange(resolved);
  }, [cancelFrame, count, index, onIndexChange, onInteraction, resolveIndex]);

  const consumeClickSuppression = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  const visibleIndexes = useMemo(() => Array.from({ length: count }, (_, mediaIndex) => mediaIndex), [count]);

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event, true),
    },
    consumeClickSuppression,
    isAnimating,
    jumpTo,
    move,
    onTransitionEnd: () => setIsAnimating(false),
    transform: count > 0 ? `translate3d(calc(${-index * 100}% + ${dragX}px),0,0)` : undefined,
    visibleIndexes,
  };
}
