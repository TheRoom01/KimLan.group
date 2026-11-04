"use client";

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import RoomCard from "@/components/RoomCard";
import RoomCardSkeleton from "@/components/RoomCardSkeleton";
import { hasRecommendationFilters, recommendationLabels, RECOMMENDATION_LIMIT, ROOM_RECOMMENDATIONS_ENABLED, type RecommendedRoom, type RecommendationFilters } from "@/lib/rooms/recommendations";
import styles from "./RoomRecommendations.module.css";

type Props = {
  filters: RecommendationFilters;
  excludeIds: string[];
  adminLevel: 0 | 1 | 2;
  currentUserId?: string | null;
  currentAdminPhone?: string | null;
  currentAdminName?: string | null;
  onNavigate: (href: string) => void;
  openingRoomId?: string | null;
};
const cache = new Map<string, { at: number; rooms: RecommendedRoom[] }>();
const CACHE_MS = 30_000;

export default function RoomRecommendations(props: Props) {
  if (!ROOM_RECOMMENDATIONS_ENABLED || !hasRecommendationFilters(props.filters)) return null;
  const requestKey = JSON.stringify({ filters: props.filters, excludeIds: [...new Set(props.excludeIds)].sort().slice(0, 20), viewer: [props.adminLevel, props.currentUserId ?? null] });
  // Remounting immediately discards the old filter's rooms, observer and request.
  return <RecommendationsForFilter key={requestKey} {...props} requestKey={requestKey} />;
}

function RecommendationsForFilter({ requestKey, ...props }: Props & { requestKey: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const roomGrid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [rooms, setRooms] = useState<RecommendedRoom[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { filters, excludeIds } = props;
  const requestBody = JSON.stringify({ filters, excludeIds });
  const { labels } = recommendationLabels(filters);

  useEffect(() => {
    const source = sentinel.current?.closest(".home-redesign")?.querySelector<HTMLElement>(".home-room-list > .grid");
    const target = roomGrid.current;
    if (!source || !target) return;
    const matchCardWidth = () => {
      const width = source.firstElementChild?.getBoundingClientRect().width;
      if (!width) return;
      const style = getComputedStyle(source);
      const gap = parseFloat(style.columnGap) > 0 ? style.columnGap : style.rowGap;
      target.style.setProperty("--recommendation-card-width", `${width}px`);
      target.style.setProperty("--recommendation-card-gap", gap);
      target.dataset.matchListCard = "true";
    };
    matchCardWidth();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(matchCardWidth);
    observer.observe(source);
    return () => observer.disconnect();
  }, [loading, rooms?.length, loadError]);

  useEffect(() => {
    if (!sentinel.current) return;
    if (!("IntersectionObserver" in window)) { setNearEnd(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearEnd(true); observer.disconnect(); }
    }, { rootMargin: "360px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearEnd) return;
    const cached = cache.get(requestKey);
    if (cached && Date.now() - cached.at < CACHE_MS) { setRooms(cached.rooms); return; }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch("/api/room-recommendations", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody,
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Recommendations unavailable");
        const body = await response.json();
        if (controller.signal.aborted) return;
        const excluded = new Set<string>((JSON.parse(requestBody) as { excludeIds: string[] }).excludeIds);
        const seen = new Set<string>();
        const next = (Array.isArray(body.data) ? body.data : []).filter((room: RecommendedRoom) => {
          if (!room.id || excluded.has(room.id) || seen.has(room.id)) return false;
          seen.add(room.id); return true;
        }).slice(0, RECOMMENDATION_LIMIT) as RecommendedRoom[];
        cache.set(requestKey, { at: Date.now(), rooms: next });
        if (cache.size > 12) cache.delete(cache.keys().next().value!);
        setRooms(next);
      } catch {
        if (!controller.signal.aborted) { setRooms([]); setLoadError(true); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [nearEnd, requestKey, requestBody, attempt]);

  const scrollCards = (direction: -1 | 1) => {
    const target = roomGrid.current;
    if (!target) return;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    const gap = parseFloat(getComputedStyle(target).columnGap) || 0;
    target.scrollBy({ left: direction * (width + gap), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (event.pointerType !== "mouse" || event.button !== 0 ||
      (event.target as HTMLElement).closest("button,input,textarea,select,.home-room-toolbar,.home-room-amenities")) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const delta = event.clientX - current.x;
    if (!current.moved && (Math.abs(delta) < 6 || Math.abs(delta) < Math.abs(event.clientY - current.y))) return;
    if (!current.moved) {
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = current.left - delta;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = current.moved && event.type !== "pointercancel";
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div ref={sentinel} className={`home-room-recommendations ${styles.anchor}`}>
    {loading || rooms?.length || loadError ? <section className={styles.section} aria-labelledby="room-recommendations-title" aria-busy={loading}>
      <header className={styles.header}>
        <div><h2 id="room-recommendations-title">✨Đề xuất thêm phòng phù hợp với bạn</h2></div>
        <div className={styles.headerControls}>
          {labels.length ? <div className={styles.badges}>{labels.map(label => <span key={label}>{label}</span>)}</div> : null}
          {rooms && rooms.length > 1 ? <div className={styles.scrollControls}>
            <button type="button" aria-label="Cuộn đề xuất sang trái" title="Cuộn sang trái" onClick={() => scrollCards(-1)}>‹</button>
            <button type="button" aria-label="Cuộn đề xuất sang phải" title="Cuộn sang phải" onClick={() => scrollCards(1)}>›</button>
          </div> : null}
        </div>
      </header>
      {loadError ? <div className={styles.error} role="status">
        <p>Chưa tải được phòng đề xuất. Vui lòng thử lại.</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className={styles.retry}>Thử lại</button>
      </div> : null}
      <div ref={roomGrid} className={styles.rail} role="group" aria-label="Danh sách phòng đề xuất, cuộn ngang" tabIndex={0}
        onPointerDownCapture={startDrag} onPointerMoveCapture={moveDrag} onPointerUpCapture={endDrag} onPointerCancelCapture={endDrag}
        onDragStart={event=>event.preventDefault()}
        onClickCapture={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation()}}}>
        {loading ? Array.from({ length: 3 }, (_, i) => <RoomCardSkeleton key={i} />)
          : rooms?.map((room, index) => {
            const card = <RoomCard room={room} adminLevel={props.adminLevel} currentUserId={props.currentUserId}
              currentAdminPhone={props.currentAdminPhone} currentAdminName={props.currentAdminName}
              onNavigate={props.onNavigate} isOpening={props.openingRoomId === room.id} index={index} />;
            return <Fragment key={room.id}>{typeof room.distance_km === "number" ? <div className={styles.item}>
              <p className={styles.distance}>Cách điểm tìm kiếm khoảng {room.distance_km.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km · đường chim bay</p>
              {card}
            </div> : card}</Fragment>;
          })}
      </div>
    </section> : null}
  </div>;
}
