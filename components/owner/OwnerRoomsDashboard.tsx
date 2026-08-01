"use client";

import {
  AlertCircle,
  Building2,
  Filter,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import RoomCard from "@/components/owner/RoomCard";
import {
  propertyDisplayAddress,
  type PropertyAddressLike,
} from "@/lib/owner/propertyDisplayAddress";
import type { OwnerTenantReference } from "@/lib/owner/types";

type RoomStatus = "empty" | "rented" | "upcoming";

type OwnerRoom = {
  id: string;
  code?: string | null;
  room_code?: string | null;
  room_number?: string | null;
  room_type?: string | null;
  status?: string | null;
  displayStatus?: string | null;
  price?: number | null;
  property_id?: string | null;
  property?: (PropertyAddressLike & { id?: string | null }) | null;
  properties?:
    | (PropertyAddressLike & { id?: string | null })
    | Array<PropertyAddressLike & { id?: string | null }>
    | null;
  tenants?: OwnerTenantReference[] | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  contract?: {
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  [key: string]: unknown;
};

type BuildingGroup = {
  key: string;
  property: (PropertyAddressLike & { id?: string | null }) | null;
  rooms: OwnerRoom[];
};

const STATUS_OPTIONS: Array<{ value: "all" | RoomStatus; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "empty", label: "Đang trống" },
  { value: "upcoming", label: "Sắp trống" },
  { value: "rented", label: "Đã thuê" },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type CardSize = { width: number; height: number };
type CardSizes = Record<string, CardSize>;

const DEFAULT_CARD_SIZE: CardSize = { width: 150, height: 76 };
const CARD_LIMITS = {
  minWidth: 120,
  maxWidth: 300,
  minHeight: 76,
  maxHeight: 240,
};
const ROOM_SIZE_STORAGE_KEY = "owner-room-card-sizes-v1";

function normalizedStatus(room: OwnerRoom): RoomStatus {
  const status = String(room.displayStatus || room.status || "").toLowerCase();
  if (status === "upcoming" || status === "sắp trống") return "upcoming";
  if (
    status === "rented" ||
    status === "occupied" ||
    status === "đã thuê"
  ) {
    return "rented";
  }
  return "empty";
}

function roomCode(room: OwnerRoom) {
  return String(room.room_code || room.code || room.room_number || "").trim();
}

function roomProperty(room: OwnerRoom) {
  if (room.property) return room.property;
  return Array.isArray(room.properties) ? room.properties[0] ?? null : room.properties ?? null;
}

function propertyCode(property: PropertyAddressLike | null) {
  return String(property?.code || property?.name || "Chưa có mã");
}

function buildingAddress(property: PropertyAddressLike | null) {
  if (!property) return "Tòa nhà chưa cập nhật địa chỉ";
  return propertyDisplayAddress(property) || "Tòa nhà chưa cập nhật địa chỉ";
}

function BuildingBoard({ group }: { group: BuildingGroup }) {
  const [order, setOrder] = useState(() => group.rooms.map((room) => room.id));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [cardSizes, setCardSizes] = useState<CardSizes>({});
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const lastDragTarget = useRef<string | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pointerOrigin.current = null;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(ROOM_SIZE_STORAGE_KEY) || "{}") as CardSizes;
        setCardSizes(Object.fromEntries(
          Object.entries(saved).map(([id, size]) => [id, {
            width: clamp(Number(size.width) || DEFAULT_CARD_SIZE.width, CARD_LIMITS.minWidth, CARD_LIMITS.maxWidth),
            height: clamp(Number(size.height) || DEFAULT_CARD_SIZE.height, CARD_LIMITS.minHeight, CARD_LIMITS.maxHeight),
          }]),
        ));
      } catch {
        // Dùng kích thước mặc định nếu storage không hợp lệ.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persistCardSizes = (next: CardSizes) => {
    setCardSizes(next);
    try {
      const stored = JSON.parse(localStorage.getItem(ROOM_SIZE_STORAGE_KEY) || "{}") as CardSizes;
      localStorage.setItem(ROOM_SIZE_STORAGE_KEY, JSON.stringify({ ...stored, ...next }));
    } catch {
      // Trình duyệt có thể chặn storage; state của phiên hiện tại vẫn hoạt động.
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpandedId(null);
      setHelpOpen(false);
      setResizingId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!expandedId && !helpOpen && !resizingId) return;

    const isInsideFloating = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest(`[data-building-floating="${group.key}"]`));
    const closeFloating = () => {
      setExpandedId(null);
      setHelpOpen(false);
      setResizingId(null);
      clearLongPress();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInsideFloating(event.target)) closeFloating();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons > 0 && !isInsideFloating(event.target)) closeFloating();
    };
    const onOutsideMotion = (event: Event) => {
      if (!isInsideFloating(event.target)) closeFloating();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("wheel", onOutsideMotion, true);
    document.addEventListener("touchmove", onOutsideMotion, true);
    document.addEventListener("scroll", onOutsideMotion, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("wheel", onOutsideMotion, true);
      document.removeEventListener("touchmove", onOutsideMotion, true);
      document.removeEventListener("scroll", onOutsideMotion, true);
    };
  }, [expandedId, group.key, helpOpen, resizingId]);

  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    [],
  );

  useEffect(() => {
    const cancelPendingLongPress = () => clearLongPress();
    document.addEventListener("scroll", cancelPendingLongPress, true);
    document.addEventListener("touchmove", cancelPendingLongPress, true);
    document.addEventListener("wheel", cancelPendingLongPress, true);
    return () => {
      document.removeEventListener("scroll", cancelPendingLongPress, true);
      document.removeEventListener("touchmove", cancelPendingLongPress, true);
      document.removeEventListener("wheel", cancelPendingLongPress, true);
    };
  }, []);

  const orderedRooms = useMemo(() => {
    const roomMap = new Map(group.rooms.map((room) => [room.id, room]));
    const ordered = order.flatMap((id) => {
      const room = roomMap.get(id);
      return room ? [room] : [];
    });
    const orderedIds = new Set(ordered.map((room) => room.id));
    return [...ordered, ...group.rooms.filter((room) => !orderedIds.has(room.id))];
  }, [group.rooms, order]);

  const upcomingCount = group.rooms.filter(
    (room) => normalizedStatus(room) === "upcoming",
  ).length;

  const moveRoom = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setOrder((current) => {
      const availableIds = group.rooms.map((room) => room.id);
      const next = [
        ...current.filter((id) => availableIds.includes(id)),
        ...availableIds.filter((id) => !current.includes(id)),
      ];
      const sourceIndex = next.indexOf(sourceId);
      const targetIndex = next.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  const onCardPointerDown = (event: ReactPointerEvent, roomId: string) => {
    if (resizingId || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-interactive="true"]')) return;
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = setTimeout(() => {
      setResizingId(roomId);
      setExpandedId(null);
      suppressClickUntil.current = Date.now() + 600;
      longPressTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(35);
    }, 1000);
  };

  const onCardPointerMove = (event: ReactPointerEvent) => {
    const origin = pointerOrigin.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) {
      clearLongPress();
    }
  };

  const onDragHandlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    sourceId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    clearLongPress();
    if (resizingId === sourceId) return;
    setExpandedId(null);
    setDraggedId(sourceId);
    lastDragTarget.current = sourceId;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const findTarget = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      const card = element?.closest<HTMLElement>("[data-room-card]");
      if (!card || !boardRef.current?.contains(card)) return null;
      return card.dataset.roomId || null;
    };

    const onMove = (pointerEvent: PointerEvent) => {
      const targetId = findTarget(pointerEvent.clientX, pointerEvent.clientY);
      setDragOverId(targetId);
      if (
        targetId &&
        targetId !== sourceId &&
        targetId !== lastDragTarget.current
      ) {
        moveRoom(sourceId, targetId);
        lastDragTarget.current = targetId;
      }
    };
    const onEnd = (pointerEvent: PointerEvent) => {
      const targetId = findTarget(pointerEvent.clientX, pointerEvent.clientY);
      if (
        targetId &&
        targetId !== sourceId &&
        targetId !== lastDragTarget.current
      ) {
        moveRoom(sourceId, targetId);
      }
      setDraggedId(null);
      setDragOverId(null);
      lastDragTarget.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const resizeCard = (roomId: string, axis: "width" | "height", amount: number) => {
    const current = cardSizes[roomId] || DEFAULT_CARD_SIZE;
    const nextSize = axis === "width"
      ? { ...current, width: clamp(current.width + amount, CARD_LIMITS.minWidth, CARD_LIMITS.maxWidth) }
      : { ...current, height: clamp(current.height + amount, CARD_LIMITS.minHeight, CARD_LIMITS.maxHeight) };
    persistCardSizes({ ...cardSizes, [roomId]: nextSize });
  };

  return (
    <section
      ref={boardRef}
      className="relative w-full min-w-0 max-w-full overflow-visible rounded-[22px] border border-[#ead8bd] bg-[#fffaf1] p-3 shadow-[0_8px_24px_rgba(91,57,31,0.06)] sm:p-4"
    >
      <header className="mb-3 flex items-start justify-between gap-3 border-b border-[#efe1cc] pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-[#3f2a1b] sm:text-base">
            {buildingAddress(group.property)}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#81664f]">
            <span>Mã: {propertyCode(group.property)}</span>
            <span>{group.rooms.length} phòng</span>
            <span className="font-semibold text-amber-700">
              {upcomingCount} sắp trống
            </span>
          </div>
        </div>
        <div className="relative h-4 w-4 shrink-0">
          <button
            type="button"
            aria-label="Hướng dẫn thao tác phòng"
            aria-expanded={helpOpen}
            data-interactive="true"
            data-building-floating={group.key}
            onClick={() => setHelpOpen((open) => !open)}
            title="Hướng dẫn thao tác phòng"
            className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center text-[#875d38] transition hover:text-[#5f3b20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b77a45]"
          >
            <AlertCircle className="h-4 w-4" />
          </button>
          {helpOpen ? (
            <div
              data-building-floating={group.key}
              role="dialog"
              aria-label="Hướng dẫn sắp xếp và thay đổi kích thước"
              className="absolute right-0 top-10 z-40 w-[min(290px,calc(100vw-48px))] rounded-2xl border border-[#dfc9aa] bg-white p-4 text-xs leading-5 text-[#60452f] shadow-xl"
            >
              <p className="font-bold text-[#3f2a1b]">Hướng dẫn thao tác</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Kéo biểu tượng chấm ở card để đổi vị trí phòng.</li>
                <li>Nhấn giữ card 1 giây để bật chế độ thay đổi kích thước riêng.</li>
                <li>Dùng control Ngang/Dọc trên card để tăng hoặc giảm kích thước.</li>
                <li>Chọn “Xong” hoặc nhấn Esc để thoát chế độ resize.</li>
              </ul>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="mt-3 font-semibold text-[#8a542e] hover:underline"
              >
                Đã hiểu
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div
        className="flex flex-wrap items-start gap-2.5"
      >
        {orderedRooms.map((room) => {
          const size = cardSizes[room.id] || DEFAULT_CARD_SIZE;
          const isResizing = resizingId === room.id;
          return <div
            key={room.id}
            data-room-card
            data-room-id={room.id}
            data-building-floating={expandedId === room.id || isResizing ? group.key : undefined}
            onPointerDown={(event) => onCardPointerDown(event, room.id)}
            onPointerMove={onCardPointerMove}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            style={{ width: `min(100%, ${size.width}px)`, minHeight: size.height }}
            className={`relative max-w-full shrink-0 transition ${
              draggedId === room.id ? "scale-[0.98] opacity-45" : ""
            } ${dragOverId === room.id ? "ring-2 ring-[#98633a] ring-offset-2" : ""}`}
          >
            <RoomCard
              room={room}
              expanded={expandedId === room.id}
              resizeMode={isResizing}
              width={size.width}
              height={size.height}
              onToggle={() => {
                if (resizingId || Date.now() < suppressClickUntil.current) return;
                setExpandedId((current) => (current === room.id ? null : room.id));
              }}
              onResize={(axis, amount) => resizeCard(room.id, axis, amount)}
              onResizeDone={() => setResizingId(null)}
              onDragHandlePointerDown={(event) =>
                onDragHandlePointerDown(event, room.id)
              }
            />
          </div>
        })}
      </div>
    </section>
  );
}

export default function OwnerRoomsDashboard({ rooms }: { rooms: OwnerRoom[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | RoomStatus>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    const isOutside = (target: EventTarget | null) =>
      target instanceof Node && !searchFilterRef.current?.contains(target);
    const closeFromPointer = (event: PointerEvent) => {
      if (isOutside(event.target)) setFiltersOpen(false);
    };
    const closeFromMove = (event: PointerEvent) => {
      if (event.buttons > 0 && isOutside(event.target)) setFiltersOpen(false);
    };
    const closeFromMotion = (event: Event) => {
      if (isOutside(event.target)) setFiltersOpen(false);
    };
    const closeFromKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", closeFromPointer, true);
    document.addEventListener("pointermove", closeFromMove, true);
    document.addEventListener("wheel", closeFromMotion, true);
    document.addEventListener("touchmove", closeFromMotion, true);
    document.addEventListener("scroll", closeFromMotion, true);
    document.addEventListener("keydown", closeFromKey);
    return () => {
      document.removeEventListener("pointerdown", closeFromPointer, true);
      document.removeEventListener("pointermove", closeFromMove, true);
      document.removeEventListener("wheel", closeFromMotion, true);
      document.removeEventListener("touchmove", closeFromMotion, true);
      document.removeEventListener("scroll", closeFromMotion, true);
      document.removeEventListener("keydown", closeFromKey);
    };
  }, [filtersOpen]);

  const totals = useMemo(() => {
    const result = { total: rooms.length, empty: 0, upcoming: 0, rented: 0 };
    rooms.forEach((room) => {
      result[normalizedStatus(room)] += 1;
    });
    return result;
  }, [rooms]);

  const occupancy = totals.total
    ? Math.round(((totals.rented + totals.upcoming) / totals.total) * 100)
    : 0;

  const buildingCount = useMemo(
    () => new Set(rooms.map((room) => room.property_id).filter(Boolean)).size,
    [rooms],
  );

  const filteredRooms = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    return rooms.filter((room) => {
      if (status !== "all" && normalizedStatus(room) !== status) return false;
      if (!needle) return true;
      const searchable = [
        roomCode(room),
        room.room_type,
        propertyCode(roomProperty(room)),
        buildingAddress(roomProperty(room)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("vi");
      return searchable.includes(needle);
    });
  }, [rooms, search, status]);

  const groups = useMemo(() => {
    const map = new Map<string, BuildingGroup>();
    filteredRooms.forEach((room) => {
      const key = String(room.property_id || "unassigned");
      const current = map.get(key);
      if (current) current.rooms.push(room);
      else map.set(key, { key, property: roomProperty(room), rooms: [room] });
    });
    return Array.from(map.values());
  }, [filteredRooms]);

  const upcomingRooms = useMemo(
    () => rooms.filter((room) => normalizedStatus(room) === "upcoming"),
    [rooms],
  );

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-clip pb-8 text-[#3f2a1b]">
      <div className="grid min-w-0 max-w-full grid-cols-2 gap-2.5 lg:grid-cols-[140px_190px_210px_minmax(340px,1fr)] lg:items-stretch">
        <article className="flex min-h-[92px] min-w-0 items-center gap-3 rounded-2xl border border-[#ead8bd] bg-[#fff8ec] p-3 shadow-sm">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4dfc3] text-[#744722]">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#876e58]">
              Tòa nhà
            </p>
            <p className="mt-0.5 text-2xl font-black tabular-nums">{buildingCount}</p>
          </div>
        </article>

        <article className="min-h-[92px] min-w-0 rounded-2xl border border-[#ead8bd] bg-[#fff8ec] p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#876e58]">
              Tỷ lệ lấp đầy
            </p>
            <strong className="text-xl tabular-nums text-[#744722]">{occupancy}%</strong>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eadfce]">
            <div
              className="h-full rounded-full bg-[#819a55] transition-[width]"
              style={{ width: `${occupancy}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-[#8b725c]">Đã thuê + sắp trống / tổng phòng</p>
        </article>

        <article className="col-span-2 min-h-[92px] min-w-0 rounded-2xl border border-[#ead8bd] bg-[#fff8ec] p-3 shadow-sm lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#876e58]">
            Tình trạng phòng
          </p>
          <div className="mt-2 grid grid-cols-3 divide-x divide-[#ead8bd] text-center">
            <div><strong className="block text-lg tabular-nums">{totals.total}</strong><span className="text-[10px] text-[#806a58]">Tổng</span></div>
            <div><strong className="block text-lg tabular-nums text-emerald-700">{totals.empty}</strong><span className="text-[10px] text-[#806a58]">Đang trống</span></div>
            <div><strong className="block text-lg tabular-nums text-amber-700">{totals.upcoming}</strong><span className="text-[10px] text-[#806a58]">Sắp trống</span></div>
          </div>
        </article>

        <div ref={searchFilterRef} className="relative col-span-2 self-center lg:col-span-1">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Tìm địa chỉ hoặc mã tòa nhà</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#967b64]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Địa chỉ, mã tòa nhà, mã phòng..."
                className="h-11 w-full rounded-xl border border-[#dec9ad] bg-white pl-9 pr-8 text-sm outline-none transition placeholder:text-[#aa9582] focus:border-[#9b6840] focus:ring-2 focus:ring-[#d9b993]/40 lg:h-10"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Xóa từ khóa"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#856b54] hover:bg-[#f5e8d6]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              aria-label="Mở bộ lọc trạng thái"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition lg:h-10 ${
                status !== "all"
                  ? "border-[#744722] bg-[#744722] text-white"
                  : "border-[#dec9ad] bg-white text-[#68482f] hover:bg-[#f7ead6]"
              }`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Lọc</span>
            </button>
          </div>
          {filtersOpen ? (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 flex max-w-[min(420px,calc(100vw-32px))] flex-wrap justify-end gap-1.5 rounded-xl border border-[#dec9ad] bg-[#fffaf1] p-2 shadow-xl">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    status === option.value
                      ? "bg-[#744722] text-white"
                      : "bg-[#efe3d2] text-[#68482f] hover:bg-[#e3d0b7]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 max-w-full items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 max-w-full space-y-4">
          {groups.length ? (
            groups.map((group) => <BuildingBoard key={group.key} group={group} />)
          ) : (
            <div className="rounded-[22px] border border-dashed border-[#d9c3a5] bg-[#fffaf1] px-5 py-14 text-center">
              <p className="font-semibold">Không tìm thấy phòng phù hợp</p>
              <p className="mt-1 text-sm text-[#826a56]">Thử đổi từ khóa hoặc trạng thái lọc.</p>
            </div>
          )}
        </div>

        <aside className="w-full min-w-0 max-w-full overflow-hidden rounded-[22px] border border-[#ead8bd] bg-[#fffaf1] p-4 shadow-[0_8px_24px_rgba(91,57,31,0.06)] xl:sticky xl:top-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#efe1cc] pb-3">
            <h2 className="min-w-0 break-words text-sm font-bold uppercase tracking-wide">Danh sách phòng sắp trống</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{upcomingRooms.length}</span>
          </div>
          <div className="mt-2 max-h-[440px] space-y-1 overflow-y-auto pr-1">
            {upcomingRooms.length ? upcomingRooms.map((room) => (
              <div key={room.id} className="rounded-xl px-2 py-2.5 transition hover:bg-[#f7ead6]">
                <p className="text-sm font-bold">Phòng {roomCode(room) || "Chưa có mã"}</p>
                <p className="mt-0.5 truncate text-xs text-[#806a58]">{buildingAddress(roomProperty(room))}</p>
              </div>
            )) : <p className="py-8 text-center text-sm text-[#8a735f]">Chưa có phòng sắp trống.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
