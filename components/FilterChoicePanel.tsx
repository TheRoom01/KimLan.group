"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type MutableRefObject } from "react";

export const AMENITIES_MODAL_QUERY = "(max-width: 640px), (max-width: 950px) and (max-height: 500px) and (pointer: coarse)";

type Props = {
  title: string;
  anchorRef: RefObject<HTMLButtonElement>;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  width?: number;
  amenities?: boolean;
  onClear: () => void;
  onClose: () => void;
  children: ReactNode;
};

/** Shared viewport-safe shell for district and amenity choices. */
export default function FilterChoicePanel({ title, anchorRef, panelRef, width = 260, amenities = false, onClear, onClose, children }: Props) {
  const titleId = useId();
  const modalRef = useRef<HTMLDialogElement>(null);
  const [mobileModal, setMobileModal] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!amenities) return;
    const media = window.matchMedia(AMENITIES_MODAL_QUERY);
    const update = () => setMobileModal(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [amenities]);

  useLayoutEffect(() => {
    const modal = modalRef.current;
    if (!mobileModal || !modal) return;
    const anchor = anchorRef.current;
    const scroller = anchor?.closest<HTMLElement>(".overflow-y-auto");
    const locked = [document.documentElement, document.body, scroller].filter((element): element is HTMLElement => Boolean(element));
    const previous = locked.map(element => ({ overflow: element.style.overflow, left: element.scrollLeft, top: element.scrollTop }));
    const restoreScroll = () => locked.forEach((element, index) => {
      element.scrollLeft = previous[index].left;
      element.scrollTop = previous[index].top;
    });
    const viewport = window.visualViewport;
    const placeModal = () => {
      if (!viewport) return;
      modal.style.setProperty("--amenities-viewport-left", `${viewport.offsetLeft}px`);
      modal.style.setProperty("--amenities-viewport-top", `${viewport.offsetTop}px`);
      modal.style.setProperty("--amenities-viewport-width", `${viewport.width}px`);
      modal.style.setProperty("--amenities-viewport-height", `${viewport.height}px`);
    };
    locked.forEach(element => { element.style.overflow = "hidden"; });
    placeModal();
    viewport?.addEventListener("resize", placeModal);
    viewport?.addEventListener("scroll", placeModal);
    modal.showModal();
    modal.querySelector<HTMLButtonElement>(".room-filter-choice-heading button:last-child")?.focus({ preventScroll: true });
    restoreScroll();
    return () => {
      viewport?.removeEventListener("resize", placeModal);
      viewport?.removeEventListener("scroll", placeModal);
      modal.close();
      locked.forEach((element, index) => { element.style.overflow = previous[index].overflow; });
      anchor?.focus({ preventScroll: true });
      restoreScroll();
    };
  }, [anchorRef, mobileModal]);

  useLayoutEffect(() => {
    if (mobileModal) return;
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
      const useBelow = amenities || below >= Math.min(328, above);
      const maxHeight = Math.min(amenities ? 560 : 328, useBelow ? below : above);
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
  }, [amenities, anchorRef, mobileModal, panelRef, width]);

  const close = () => { onClose(); anchorRef.current?.focus({ preventScroll: true }); };
  const panel = (
    <div ref={panelRef} role={mobileModal ? undefined : "dialog"} aria-labelledby={mobileModal ? undefined : titleId}
      className={`home-filter-panel room-filter-choice-panel${amenities ? " room-amenities-panel" : ""}`}
      style={mobileModal ? undefined : { ...position, visibility: position ? "visible" : "hidden" }}
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
  if (!mobileModal) return panel;
  return (
    <dialog ref={modalRef} aria-labelledby={titleId} className="room-amenities-dialog"
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {panel}
    </dialog>
  );
}
