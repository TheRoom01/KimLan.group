"use client";

import { useId, useLayoutEffect, useState, type ReactNode, type RefObject, type MutableRefObject } from "react";

type Props = {
  title: string;
  anchorRef: RefObject<HTMLButtonElement>;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  width?: number;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
};

/** Shared viewport-safe shell for district and amenity choices. */
export default function FilterChoicePanel({ title, anchorRef, panelRef, width = 260, onClear, onClose, children }: Props) {
  const titleId = useId();
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const viewport = window.visualViewport;
      const header = document.querySelector('[data-home-header="true"]')?.getBoundingClientRect();
      const topEdge = Math.max(viewport?.offsetTop ?? 0, header?.bottom ?? 0) + 8;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
      const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const footer = document.querySelector(".home-pagination")?.getBoundingClientRect();
      const bottomEdge = Math.min(viewportBottom, footer && footer.height > 0 ? footer.top : viewportBottom) - 8;
      const panelWidth = Math.min(width, (viewport?.width ?? window.innerWidth) - 24);
      const bounds = anchor.getBoundingClientRect();
      const below = Math.max(0, bottomEdge - bounds.bottom - 10);
      const above = Math.max(0, bounds.top - topEdge - 10);
      const useBelow = below >= Math.min(328, above);
      const maxHeight = Math.min(328, useBelow ? below : above);
      // Apply the constraint before measuring, so opening above uses the real height.
      panel.style.maxHeight = `${maxHeight}px`;
      panel.style.width = `${panelWidth}px`;
      const height = panel.getBoundingClientRect().height;
      setPosition({
        top: Math.max(topEdge, useBelow ? bounds.bottom + 10 : bounds.top - height - 10),
        left: Math.max(leftEdge, Math.min(bounds.left, leftEdge + (viewport?.width ?? window.innerWidth) - 24 - panelWidth)),
        width: panelWidth,
        maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [anchorRef, panelRef, width]);

  const close = () => { onClose(); anchorRef.current?.focus({ preventScroll: true }); };
  return (
    <div ref={panelRef} role="dialog" aria-labelledby={titleId}
      className="home-filter-panel room-filter-choice-panel"
      style={{ ...position, visibility: position ? "visible" : "hidden" }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <div className="room-filter-choice-heading">
        <h3 id={titleId}>{title}</h3>
        <button type="button" onClick={onClear}>Clear</button>
        <button type="button" aria-label={`Đóng ${title.toLowerCase()}`} onClick={close}>×</button>
      </div>
      <div tabIndex={0} aria-label={`Các lựa chọn ${title.toLowerCase()}`} className="liquid-glass-scroll room-filter-choice-scroll">{children}</div>
    </div>
  );
}
