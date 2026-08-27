"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Direction = -1 | 1;

type SwipeCarouselOptions = {
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

export function useSwipeCarousel({ count, index, onIndexChange, loop = true, onInteraction }: SwipeCarouselOptions) {
  const [dragX, setDragX] = useState(0);
  const [slideDirection, setSlideDirection] = useState<-1 | 0 | 1>(0);
  const [snappingBack, setSnappingBack] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragXRef = useRef(0);

  const cancelDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, []);

  const scheduleDragX = useCallback((nextDragX: number) => {
    pendingDragXRef.current = nextDragX;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragX(pendingDragXRef.current);
    });
  }, []);

  useEffect(() => cancelDragFrame, [cancelDragFrame]);

  const resolveIndex = useCallback((candidate: number) => {
    if (count <= 0) return 0;
    if (loop) return (candidate + count) % count;
    return Math.min(Math.max(candidate, 0), count - 1);
  }, [count, loop]);

  const canMove = useCallback((direction: Direction) => {
    if (count < 2) return false;
    return loop || (index + direction >= 0 && index + direction < count);
  }, [count, index, loop]);

  const move = useCallback((direction: Direction) => {
    if (!canMove(direction) || slideDirection !== 0 || snappingBack) return false;
    onInteraction?.();
    cancelDragFrame();
    setDragX(0);
    setSlideDirection(direction);
    return true;
  }, [canMove, cancelDragFrame, onInteraction, slideDirection, snappingBack]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (count < 2 || slideDirection !== 0 || snappingBack) return;
    if ((event.target as HTMLElement)?.closest?.("button, a, input, select, textarea, video, [data-swipe-ignore='true']")) return;
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
  }, [count, onInteraction, slideDirection, snappingBack]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || slideDirection !== 0) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.axis === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 6) {
      drag.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (drag.axis === "vertical") return;
    const now = performance.now();
    const instantVelocity = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastAt);
    drag.velocityX = drag.velocityX * 0.65 + instantVelocity * 0.35;
    drag.lastX = event.clientX;
    drag.lastAt = now;
    if (Math.abs(deltaX) > 5) suppressClickRef.current = true;
    const pullingPastEdge = !loop && ((index === 0 && deltaX > 0) || (index === count - 1 && deltaX < 0));
    scheduleDragX(pullingPastEdge ? deltaX * 0.22 : deltaX);
  }, [count, index, loop, scheduleDragX, slideDirection]);

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = drag.lastX - drag.startX;
    const verticalDistance = event.clientY - drag.startY;
    const direction: Direction = distance < 0 ? 1 : -1;
    const width = Math.max(1, event.currentTarget.getBoundingClientRect().width);
    const distanceThreshold = Math.min(96, Math.max(45, width * 0.16));
    const shouldMove = !cancelled && drag.axis !== "vertical" && canMove(direction) && Math.abs(distance) > Math.abs(verticalDistance) && (Math.abs(distance) >= distanceThreshold || Math.abs(drag.velocityX) >= 0.35);
    dragRef.current = null;
    cancelDragFrame();
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    if (shouldMove) {
      move(direction);
    } else if (Math.abs(distance) > 0.5) {
      setSnappingBack(true);
      setDragX(0);
    } else {
      setDragX(0);
    }
  }, [canMove, cancelDragFrame, move]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => finishDrag(event), [finishDrag]);
  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => finishDrag(event, true), [finishDrag]);

  const onTransitionEnd = useCallback(() => {
    if (snappingBack) {
      setSnappingBack(false);
      return;
    }
    if (slideDirection === 0) return;
    onIndexChange(resolveIndex(index + slideDirection));
    setSlideDirection(0);
  }, [index, onIndexChange, resolveIndex, slideDirection, snappingBack]);

  const jumpTo = useCallback((nextIndex: number) => {
    if (slideDirection !== 0 || snappingBack || count <= 0) return;
    onInteraction?.();
    cancelDragFrame();
    setDragX(0);
    onIndexChange(resolveIndex(nextIndex));
  }, [cancelDragFrame, count, onIndexChange, onInteraction, resolveIndex, slideDirection, snappingBack]);

  const consumeClickSuppression = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  const visibleIndexes = useMemo(() => count > 1 ? [resolveIndex(index - 1), index, resolveIndex(index + 1)] : count === 1 ? [index] : [], [count, index, resolveIndex]);
  const transform = slideDirection === 1
    ? "translate3d(-200%,0,0)"
    : slideDirection === -1
      ? "translate3d(0,0,0)"
      : `translate3d(calc(-100% + ${dragX}px),0,0)`;

  return {
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    consumeClickSuppression,
    isAnimating: slideDirection !== 0 || snappingBack,
    jumpTo,
    move,
    onTransitionEnd,
    transform: count > 1 ? transform : undefined,
    visibleIndexes,
  };
}
