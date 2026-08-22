"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, Layers3, Loader2, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";
import type { MapBounds, MapRoom } from "@/lib/map/types";
import { getViewedRoomIds, markRoomViewed, VIEWED_ROOMS_CHANGED_EVENT } from "@/lib/viewedRooms";
import AnonymousLockModal from "@/components/AnonymousLockModal";
import { useAnonymousListingGate } from "@/hooks/useAnonymousListingGate";

type Place = { id: string; label: string; latitude: number; longitude: number; category?: string; type?: string };
type Nearby = { latitude: number; longitude: number; radius: number };
type RoomLocationGroup = {
  key: string;
  latitude: number;
  longitude: number;
  rooms: MapRoom[];
};
type MarkerPreview = {
  key: string;
  x: number;
  y: number;
  placeBelow: boolean;
  rooms: MapRoom[];
};
type SearchFocus = Place & { query: string; addressLike: boolean };
type SearchFocusFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, never>;
  }>;
};
type RoomFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      locationKey: string;
      roomCount: number;
      markerLabel: string;
      statusTone: "available" | "upcoming" | "rented";
      viewed: boolean;
      searchMatch: boolean;
    };
  }>;
};

const DEFAULT_CENTER: [number, number] = [106.6819, 10.7626];
const MAP_PRICE_MIN = 3_000_000;
const MAP_PRICE_MAX = 30_000_000;
const MAP_PRICE_STEP = 1_000_000;
const MAP_STYLE_STORAGE_KEY = "kimlan-map-style-v1";
const EMPTY_SEARCH_FOCUS: SearchFocusFeatureCollection = { type: "FeatureCollection", features: [] };
const ROOM_STATUS_OPTIONS = ["Đang trống", "Sắp trống", "Đã thuê"] as const;
const DEFAULT_ROOM_STATUSES = ["Đang trống", "Sắp trống"] as const;
const MAP_STYLE_OPTIONS = [
  { id: "liberty", label: "Liberty", description: "Cân bằng", url: "https://tiles.openfreemap.org/styles/liberty", colors: ["#e7e2d2", "#8fb5a2"] },
  { id: "positron", label: "Sáng", description: "Tối giản", url: "https://tiles.openfreemap.org/styles/positron", colors: ["#f7f7f5", "#c9d0d2"] },
  { id: "bright", label: "Màu sắc", description: "Nổi bật", url: "https://tiles.openfreemap.org/styles/bright", colors: ["#f4d88a", "#72b3b1"] },
  { id: "fiord", label: "Fiord", description: "Trầm lạnh", url: "https://tiles.openfreemap.org/styles/fiord", colors: ["#263746", "#849eaa"] },
] as const;

type MapStyleId = (typeof MAP_STYLE_OPTIONS)[number]["id"];

function mapStyleOption(id: MapStyleId) {
  return MAP_STYLE_OPTIONS.find((option) => option.id === id) ?? MAP_STYLE_OPTIONS[0];
}

function clampPrice(value: number) {
  return Math.max(MAP_PRICE_MIN, Math.min(MAP_PRICE_MAX, value));
}

function normalizePriceRange(minimum: number, maximum: number): [number, number] {
  const min = clampPrice(Number.isFinite(minimum) ? minimum : MAP_PRICE_MIN);
  const max = clampPrice(Number.isFinite(maximum) ? maximum : MAP_PRICE_MAX);
  return min < max ? [min, max] : [Math.max(MAP_PRICE_MIN, max - MAP_PRICE_STEP), max];
}

function millionLabel(value: number) {
  return `${value / 1_000_000} triệu`;
}

function listParam(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function MapPriceRange({
  value,
  active,
  onCommit,
  onClear,
}: {
  value: [number, number];
  active: boolean;
  onCommit: (value: [number, number]) => void;
  onClear: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<[number, number]>(value);
  const [draft, setDraft] = useState<[number, number]>(value);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  const setNextDraft = useCallback((next: [number, number]) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const updateFromClientX = useCallback((clientX: number, thumb: "min" | "max") => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const snapped = clampPrice(Math.round((MAP_PRICE_MIN + percentage * (MAP_PRICE_MAX - MAP_PRICE_MIN)) / MAP_PRICE_STEP) * MAP_PRICE_STEP);
    const [min, max] = draftRef.current;
    setNextDraft(thumb === "min"
      ? [Math.min(snapped, max - MAP_PRICE_STEP), max]
      : [min, Math.max(snapped, min + MAP_PRICE_STEP)]);
  }, [setNextDraft]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => updateFromClientX(event.clientX, dragging);
    const stop = () => {
      onCommit(draftRef.current);
      setDragging(null);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", stop, { passive: true });
    window.addEventListener("pointercancel", stop, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, onCommit, updateFromClientX]);

  const beginThumbDrag = (thumb: "min" | "max") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(thumb);
  };

  const beginTrackDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = MAP_PRICE_MIN + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (MAP_PRICE_MAX - MAP_PRICE_MIN);
    const thumb = Math.abs(raw - draft[0]) <= Math.abs(raw - draft[1]) ? "min" : "max";
    updateFromClientX(event.clientX, thumb);
    setDragging(thumb);
  };

  const changeByKeyboard = (thumb: "min" | "max", direction: -1 | 1) => {
    const [min, max] = draftRef.current;
    const next = thumb === "min"
      ? [Math.min(clampPrice(min + direction * MAP_PRICE_STEP), max - MAP_PRICE_STEP), max] as [number, number]
      : [min, Math.max(clampPrice(max + direction * MAP_PRICE_STEP), min + MAP_PRICE_STEP)] as [number, number];
    setNextDraft(next);
    onCommit(next);
  };

  const span = MAP_PRICE_MAX - MAP_PRICE_MIN;
  const left = ((draft[0] - MAP_PRICE_MIN) / span) * 100;
  const right = ((draft[1] - MAP_PRICE_MIN) / span) * 100;

  return (
    <section className="rounded-xl border border-[#aa825d]/25 bg-white/75 px-3 py-2.5" aria-label="Khoảng giá thuê">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <strong className="block text-xs text-[#4d3422]">Giá thuê</strong>
        </div>
        <button type="button" disabled={!active} onClick={onClear} className="text-[10px] font-bold text-[#744722] disabled:opacity-35">Xóa giá</button>
      </div>
      <div className="flex items-end justify-between px-2 text-xs font-bold leading-tight text-[#5d381f]">
        <div><span className="mr-1 text-[9px] font-semibold text-[#80634a]">Từ</span>{millionLabel(draft[0])}</div>
        <div className="text-right"><span className="mr-1 text-[9px] font-semibold text-[#80634a]">Đến</span>{millionLabel(draft[1])}</div>
      </div>
      <div ref={trackRef} onPointerDown={beginTrackDrag} className="relative mx-2 h-7 touch-none" aria-label="Thanh chọn khoảng giá">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#ead8c0]" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#9a5c2b]" style={{ left: `${left}%`, width: `${right - left}%` }} />
        {(["min", "max"] as const).map((thumb) => {
          const current = thumb === "min" ? draft[0] : draft[1];
          const position = thumb === "min" ? left : right;
          return (
            <div
              key={thumb}
              role="slider"
              tabIndex={0}
              aria-label={thumb === "min" ? "Giá thấp nhất" : "Giá cao nhất"}
              aria-valuemin={MAP_PRICE_MIN}
              aria-valuemax={MAP_PRICE_MAX}
              aria-valuenow={current}
              onPointerDown={beginThumbDrag(thumb)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                changeByKeyboard(thumb, event.key === "ArrowLeft" ? -1 : 1);
              }}
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white bg-[#744722] shadow-md outline-none focus:ring-2 focus:ring-[#d4a56f] active:cursor-grabbing"
              style={{ left: `${position}%` }}
            />
          );
        })}
      </div>
    </section>
  );
}

function priceLabel(price: number | null) {
  if (!price) return "Liên hệ";
  const millions = price / 1_000_000;
  return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}tr`;
}

function markerPriceLabel(price: number | null) {
  if (!price) return "Liên hệ";
  const millions = (price / 1_000_000).toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
  });
  const [whole, fraction] = millions.split(",");
  return fraction ? `${whole}tr${fraction}` : `${whole}tr`;
}

function roomStatusTone(status: string | null): "available" | "upcoming" | "rented" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "sắp trống") return "upcoming";
  if (normalized === "đã thuê" || normalized === "da thue") return "rented";
  return "available";
}

function roomLocationKey(room: Pick<MapRoom, "latitude" | "longitude">) {
  return `${room.latitude.toFixed(6)}:${room.longitude.toFixed(6)}`;
}

function normalizeAddressSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roomDistanceFromSearch(room: MapRoom, focus: SearchFocus) {
  const latitudeDistance = (room.latitude - focus.latitude) * 111;
  const longitudeDistance = (room.longitude - focus.longitude) * 111 * Math.cos((focus.latitude * Math.PI) / 180);
  return Math.sqrt(latitudeDistance ** 2 + longitudeDistance ** 2);
}

function roomMatchesPlaceQuery(room: MapRoom, focus: SearchFocus) {
  if (!focus.addressLike) return false;
  const searchableAddress = normalizeAddressSearch([room.address, room.ward, room.district].filter(Boolean).join(" "));
  const normalizedQuery = normalizeAddressSearch(focus.query);
  const tokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length >= 2 && !["duong", "phuong", "quan", "huyen", "tp", "hcm", "ho", "chi", "minh"].includes(token));
  if (tokens.length > 0 && tokens.every((token) => searchableAddress.includes(token))) return true;
  const maximumFallbackDistance = /\d/.test(normalizedQuery) ? 0.25 : 0.5;
  return roomDistanceFromSearch(room, focus) <= maximumFallbackDistance;
}

function groupRoomsByLocation(rooms: MapRoom[]) {
  const groups = new Map<string, RoomLocationGroup>();
  for (const room of rooms) {
    const key = roomLocationKey(room);
    const group = groups.get(key);
    if (group) group.rooms.push(room);
    else groups.set(key, { key, latitude: room.latitude, longitude: room.longitude, rooms: [room] });
  }
  return Array.from(groups.values());
}

function createClusterPinImage(fill: string) {
  const width = 44;
  const height = 54;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo ảnh ghim bản đồ");

  const strokeWidth = 2;
  const center = width / 2;
  context.beginPath();
  context.moveTo(center, height - 1);
  context.bezierCurveTo(center - 4, height - 12, 3, 33, 3, 21);
  context.arc(center, 21, 19, Math.PI, 0);
  context.bezierCurveTo(width - 3, 33, center + 4, height - 12, center, height - 1);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = strokeWidth;
  context.strokeStyle = "#f4d4a9";
  context.stroke();

  return context.getImageData(0, 0, width, height);
}

function createPriceMarkerImage(status: "available" | "upcoming" | "rented", viewed: boolean) {
  const width = 70;
  const height = 34;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo ảnh giá phòng trên bản đồ");

  context.shadowColor = "rgba(50, 32, 20, 0.2)";
  context.shadowBlur = 3;
  context.shadowOffsetY = 1;
  const left = 2;
  const right = width - 2;
  const top = 2;
  const bodyBottom = 27;
  const radius = 11;
  const center = width / 2;
  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(right - radius, top);
  context.quadraticCurveTo(right, top, right, top + radius);
  context.lineTo(right, bodyBottom - radius);
  context.quadraticCurveTo(right, bodyBottom, right - radius, bodyBottom);
  context.lineTo(center + 5, bodyBottom);
  context.lineTo(center, height - 2);
  context.lineTo(center - 5, bodyBottom);
  context.lineTo(left + radius, bodyBottom);
  context.quadraticCurveTo(left, bodyBottom, left, bodyBottom - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
  context.fillStyle = viewed ? "#57534f" : "#8f5e38";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 1;
  context.strokeStyle = viewed ? "#403d3a" : "#e6c6a4";
  context.stroke();

  const statusColors = status === "rented"
    ? { background: "#fecaca", border: "#f87171", foreground: "#7f1d1d" }
    : status === "upcoming"
      ? { background: "#fde68a", border: "#facc15", foreground: "#854d0e" }
      : { background: "#86efac", border: "#22c55e", foreground: "#14532d" };

  context.beginPath();
  context.arc(13, 15, 8, 0, Math.PI * 2);
  context.fillStyle = statusColors.background;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = statusColors.border;
  context.stroke();

  context.strokeStyle = statusColors.foreground;
  context.lineWidth = 1.5;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(8, 18);
  context.lineTo(18, 18);
  context.moveTo(8.5, 12);
  context.lineTo(8.5, 20);
  context.moveTo(9.5, 14.5);
  context.lineTo(17, 14.5);
  context.quadraticCurveTo(18, 14.5, 18, 16);
  context.lineTo(18, 20);
  context.moveTo(10.5, 13);
  context.lineTo(13, 13);
  context.stroke();

  return context.getImageData(0, 0, width, height);
}

function createClusterSearchOutlineImage() {
  const width = 44;
  const height = 54;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo viền tìm kiếm cho cluster");
  const center = width / 2;
  context.beginPath();
  context.moveTo(center, height - 1);
  context.bezierCurveTo(center - 4, height - 12, 3, 33, 3, 21);
  context.arc(center, 21, 19, Math.PI, 0);
  context.bezierCurveTo(width - 3, 33, center + 4, height - 12, center, height - 1);
  context.closePath();
  context.lineWidth = 4;
  context.strokeStyle = "#ef4444";
  context.shadowColor = "rgba(239, 68, 68, 0.9)";
  context.shadowBlur = 5;
  context.stroke();
  return context.getImageData(0, 0, width, height);
}

function createRoomSearchOutlineImage() {
  const width = 70;
  const height = 34;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể tạo viền tìm kiếm cho marker phòng");
  const left = 2;
  const right = width - 2;
  const top = 2;
  const bodyBottom = 27;
  const radius = 11;
  const center = width / 2;
  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(right - radius, top);
  context.quadraticCurveTo(right, top, right, top + radius);
  context.lineTo(right, bodyBottom - radius);
  context.quadraticCurveTo(right, bodyBottom, right - radius, bodyBottom);
  context.lineTo(center + 5, bodyBottom);
  context.lineTo(center, height - 2);
  context.lineTo(center - 5, bodyBottom);
  context.lineTo(left + radius, bodyBottom);
  context.quadraticCurveTo(left, bodyBottom, left, bodyBottom - radius);
  context.lineTo(left, top + radius);
  context.quadraticCurveTo(left, top, left + radius, top);
  context.closePath();
  context.lineWidth = 3;
  context.strokeStyle = "#ef4444";
  context.shadowColor = "rgba(239, 68, 68, 0.95)";
  context.shadowBlur = 4;
  context.stroke();
  return context.getImageData(0, 0, width, height);
}

function addSearchMapLayers(map: MapLibreMap, data: SearchFocusFeatureCollection) {
  if (!map.hasImage("cluster-search-outline")) map.addImage("cluster-search-outline", createClusterSearchOutlineImage());
  if (!map.hasImage("room-search-outline")) map.addImage("room-search-outline", createRoomSearchOutlineImage());
  if (!map.getSource("search-focus")) map.addSource("search-focus", { type: "geojson", data });

  const firstRoomLayer = map.getLayer("clusters") ? "clusters" : undefined;
  if (!map.getLayer("search-result-area")) map.addLayer({
    id: "search-result-area",
    type: "circle",
    source: "search-focus",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 34, 14, 72, 17, 105],
      "circle-color": "#60a5fa",
      "circle-opacity": 0.16,
      "circle-stroke-color": "#3b82f6",
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.72,
    },
  }, firstRoomLayer);
  if (!map.getLayer("search-result-center")) map.addLayer({
    id: "search-result-center",
    type: "circle",
    source: "search-focus",
    paint: {
      "circle-radius": 5,
      "circle-color": "#2563eb",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  if (!map.getLayer("search-cluster-highlight")) map.addLayer({
    id: "search-cluster-highlight",
    type: "symbol",
    source: "rooms",
    filter: ["all", ["has", "point_count"], [">", ["get", "search_match_count"], 0]],
    layout: {
      "icon-image": "cluster-search-outline",
      "icon-anchor": "bottom",
      "icon-size": ["step", ["get", "room_count"], 0.9, 30, 1.05, 100, 1.2],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  if (!map.getLayer("search-room-highlight")) map.addLayer({
    id: "search-room-highlight",
    type: "symbol",
    source: "rooms",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "searchMatch"], true]],
    layout: {
      "icon-image": ["case", ["==", ["get", "roomCount"], 1], "room-search-outline", "cluster-search-outline"],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  (map.getSource("search-focus") as GeoJSONSource | undefined)?.setData(data);
}

function addRoomMapLayers(map: MapLibreMap, data: RoomFeatureCollection) {
  if (!map.hasImage("cluster-pin")) map.addImage("cluster-pin", createClusterPinImage("#744722"));
  for (const status of ["available", "upcoming", "rented"] as const) {
    if (!map.hasImage(`room-pin-${status}`)) map.addImage(`room-pin-${status}`, createPriceMarkerImage(status, false));
    if (!map.hasImage(`room-pin-${status}-viewed`)) map.addImage(`room-pin-${status}-viewed`, createPriceMarkerImage(status, true));
  }
  if (!map.getSource("rooms")) {
    map.addSource("rooms", {
      type: "geojson",
      data,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 54,
      clusterProperties: {
        room_count: ["+", ["get", "roomCount"]],
        search_match_count: ["+", ["case", ["==", ["get", "searchMatch"], true], 1, 0]],
      },
    });
  }
  if (!map.getLayer("clusters")) map.addLayer({
    id: "clusters",
    type: "symbol",
    source: "rooms",
    filter: ["has", "point_count"],
    layout: {
      "icon-image": "cluster-pin",
      "icon-anchor": "bottom",
      "icon-size": ["step", ["get", "room_count"], 0.9, 30, 1.05, 100, 1.2],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  if (!map.getLayer("cluster-count")) map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "rooms",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "room_count"],
      "text-size": 12,
      "text-offset": [0, -2.25],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#fff" },
  });
  if (!map.getLayer("room-location")) map.addLayer({
    id: "room-location",
    type: "symbol",
    source: "rooms",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": [
        "case",
        ["!=", ["get", "roomCount"], 1],
        "cluster-pin",
        [
          "concat",
          "room-pin-",
          ["get", "statusTone"],
          ["case", ["==", ["get", "viewed"], true], "-viewed", ""],
        ],
      ],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  if (!map.getLayer("room-location-count")) map.addLayer({
    id: "room-location-count",
    type: "symbol",
    source: "rooms",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["case", ["==", ["get", "roomCount"], 1], ["get", "markerLabel"], ["get", "roomCount"]],
      "text-size": ["case", ["==", ["get", "roomCount"], 1], 13, 11],
      "text-offset": [
        "case",
        ["==", ["get", "roomCount"], 1],
        ["literal", [0.92, -1.46]],
        ["literal", [0, -2.25]],
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "roomCount"], 1],
        "#ffffff",
        "#fff",
      ],
      "text-halo-color": [
        "case",
        ["==", ["get", "roomCount"], 1],
        ["case", ["==", ["get", "viewed"], true], "#403d3a", "#5b351e"],
        "rgba(0,0,0,0)",
      ],
      "text-halo-width": ["case", ["==", ["get", "roomCount"], 1], 0.8, 0],
    },
  });
  (map.getSource("rooms") as GeoJSONSource | undefined)?.setData(data);
}

export default function MapSearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasVipAccess, isAccessPending, isAnonLocked } = useAnonymousListingGate();
  const containerRef = useRef<HTMLDivElement>(null);
  const roomListPanelRef = useRef<HTMLElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeMapStyleRef = useRef<MapStyleId>("liberty");
  const roomFeatureCollectionRef = useRef<RoomFeatureCollection>({ type: "FeatureCollection", features: [] });
  const searchFocusFeatureRef = useRef<SearchFocusFeatureCollection>(EMPTY_SEARCH_FOCUS);
  const roomLocationsRef = useRef<Map<string, RoomLocationGroup>>(new Map());
  const mobilePreviewKeyRef = useRef<string | null>(null);
  const searchOriginRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const queryStringRef = useRef(searchParams.toString());
  const pendingQueryStringRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleId, setMapStyleId] = useState<MapStyleId>("liberty");
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [styleLoading, setStyleLoading] = useState(false);
  const [resultsPanelCollapsed, setResultsPanelCollapsed] = useState(false);
  const [roomListPanelBottom, setRoomListPanelBottom] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openOptionGroup, setOpenOptionGroup] = useState<"district" | "roomType" | "status" | null>(null);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [searchFocus, setSearchFocus] = useState<SearchFocus | null>(null);
  const [viewedRoomIds, setViewedRoomIds] = useState<Set<string>>(() => new Set());
  const [markerPreview, setMarkerPreview] = useState<MarkerPreview | null>(null);
  const roomLocations = useMemo(() => groupRoomsByLocation(rooms), [rooms]);
  const selectedLocationRooms = useMemo(
    () => roomLocations.find((location) => location.key === selectedLocationKey)?.rooms ?? [],
    [roomLocations, selectedLocationKey],
  );
  const districtParam = searchParams.get("district") ?? "";
  const roomTypeParam = searchParams.get("roomType") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const minPriceParam = searchParams.get("minPrice") ?? "";
  const maxPriceParam = searchParams.get("maxPrice") ?? "";
  const selectedDistricts = useMemo(() => listParam(districtParam), [districtParam]);
  const selectedRoomTypes = useMemo(() => listParam(roomTypeParam), [roomTypeParam]);
  const allStatusesSelected = statusParam === "all";
  const selectedStatuses = useMemo(() => {
    if (statusParam === "all") return [...ROOM_STATUS_OPTIONS];
    const requested = listParam(statusParam).filter((status) => ROOM_STATUS_OPTIONS.includes(status as (typeof ROOM_STATUS_OPTIONS)[number]));
    return requested.length ? requested : [...DEFAULT_ROOM_STATUSES];
  }, [statusParam]);
  const hasPriceFilter = Boolean(minPriceParam || maxPriceParam);
  const appliedPriceRange = useMemo(
    () => normalizePriceRange(Number(minPriceParam) || MAP_PRICE_MIN, Number(maxPriceParam) || MAP_PRICE_MAX),
    [maxPriceParam, minPriceParam],
  );
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (hasPriceFilter) labels.push(`Giá ${millionLabel(appliedPriceRange[0])} – ${millionLabel(appliedPriceRange[1])}`);
    if (selectedDistricts.length) labels.push(`Quận: ${selectedDistricts.join(", ")}`);
    if (selectedRoomTypes.length) labels.push(`Loại: ${selectedRoomTypes.join(", ")}`);
    labels.push(`Trạng thái: ${allStatusesSelected ? "Tất cả" : selectedStatuses.join(", ")}`);
    if (nearby) labels.push(`Gần tôi: ${nearby.radius} km`);
    return labels;
  }, [allStatusesSelected, appliedPriceRange, hasPriceFilter, nearby, selectedDistricts, selectedRoomTypes, selectedStatuses]);

  useEffect(() => {
    const current = searchParams.toString();
    if (pendingQueryStringRef.current && pendingQueryStringRef.current !== current) return;
    queryStringRef.current = current;
    pendingQueryStringRef.current = null;
  }, [searchParams]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MAP_STYLE_STORAGE_KEY);
      if (MAP_STYLE_OPTIONS.some((option) => option.id === stored)) {
        setMapStyleId(stored as MapStyleId);
      } else if (stored) {
        localStorage.removeItem(MAP_STYLE_STORAGE_KEY);
      }
    } catch {
      // The default style remains available when storage is disabled.
    }
  }, []);

  useEffect(() => {
    if (!styleMenuOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !styleMenuRef.current?.contains(target)) setStyleMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStyleMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [styleMenuOpen]);

  useEffect(() => {
    if (!openOptionGroup) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOptionGroup(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [openOptionGroup]);

  useEffect(() => {
    const syncViewedRooms = () => setViewedRoomIds(new Set(getViewedRoomIds()));
    syncViewedRooms();
    window.addEventListener(VIEWED_ROOMS_CHANGED_EVENT, syncViewedRooms);
    window.addEventListener("storage", syncViewedRooms);
    return () => {
      window.removeEventListener(VIEWED_ROOMS_CHANGED_EVENT, syncViewedRooms);
      window.removeEventListener("storage", syncViewedRooms);
    };
  }, []);

  useEffect(() => {
    if (!selectedLocationKey) return;

    const closePanel = () => {
      setSelectedLocationKey(null);
      setSelectedId(null);
    };
    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || roomListPanelRef.current?.contains(target)) return;
      if (styleMenuRef.current?.contains(target)) return;
      const targetElement = target instanceof Element ? target : target.parentElement;
      if (targetElement?.closest('[data-room-detail-modal="true"]')) return;
      closePanel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[data-room-detail-modal="true"]')) closePanel();
    };

    document.addEventListener("pointerdown", closeWhenOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedLocationKey]);

  useEffect(() => {
    if (!selectedLocationRooms.length) {
      setRoomListPanelBottom(null);
      return;
    }
    const panel = roomListPanelRef.current;
    const mapContainer = containerRef.current;
    if (!panel || !mapContainer) return;

    const updatePosition = () => {
      const panelRect = panel.getBoundingClientRect();
      const mapRect = mapContainer.getBoundingClientRect();
      setRoomListPanelBottom(Math.ceil(panelRect.bottom - mapRect.top + 8));
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(panel);
    observer.observe(mapContainer);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [selectedLocationRooms.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    const resizeAfterTransition = window.setTimeout(() => map.resize(), 320);
    return () => window.clearTimeout(resizeAfterTransition);
  }, [resultsPanelCollapsed]);

  const setParams = useCallback((updates: Record<string, string>) => {
    const next = new URLSearchParams(queryStringRef.current);
    for (const [name, value] of Object.entries(updates)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    queryStringRef.current = next.toString();
    pendingQueryStringRef.current = queryStringRef.current;
    router.replace(`/map?${queryStringRef.current}`, { scroll: false });
  }, [router]);

  const toggleListFilter = useCallback((name: "district" | "roomType", option: string) => {
    const query = new URLSearchParams(queryStringRef.current);
    const current = listParam(query.get(name));
    const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
    setParams({ [name]: next.join(",") });
  }, [setParams]);

  const toggleStatusFilter = useCallback((option: "all" | (typeof ROOM_STATUS_OPTIONS)[number]) => {
    if (option === "all") { setParams({ status: "all" }); return; }
    const query = new URLSearchParams(queryStringRef.current);
    const raw = query.get("status") ?? "";
    const current = raw === "all"
      ? [...ROOM_STATUS_OPTIONS]
      : (() => {
          const requested = listParam(raw).filter((status) => ROOM_STATUS_OPTIONS.includes(status as (typeof ROOM_STATUS_OPTIONS)[number]));
          return requested.length ? requested : [...DEFAULT_ROOM_STATUSES];
        })();
    const next = current.includes(option) ? current.filter((status) => status !== option) : [...current, option];
    if (!next.length) return;
    setParams({ status: next.length === ROOM_STATUS_OPTIONS.length ? "all" : next.join(",") });
  }, [setParams]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: DEFAULT_CENTER,
        zoom: 11,
        style: mapStyleOption("liberty").url,
      });
      mapRef.current = map;
      let firstStyleReady = false;
      let interactionsReady = false;
      const bootTimeout = window.setTimeout(() => {
        if (!firstStyleReady) setMapError(true);
      }, 12_000);
      const updateBounds = () => {
        const nextBounds = map.getBounds();
        if (nextBounds) setBounds({ west: nextBounds.getWest(), south: nextBounds.getSouth(), east: nextBounds.getEast(), north: nextBounds.getNorth() });
      };
      const registerInteractions = () => {
        if (interactionsReady) return;
        interactionsReady = true;
        updateBounds();
        map.on("moveend", updateBounds);
        const interactiveLayers = ["cluster-count", "clusters", "room-location-count", "room-location"];
        let hoveredPreviewKey: string | null = null;
        let previewRequest = 0;

        const closeMarkerPreview = () => {
          previewRequest += 1;
          hoveredPreviewKey = null;
          mobilePreviewKeyRef.current = null;
          setMarkerPreview(null);
          map.getCanvas().style.cursor = "";
        };

        const previewPosition = (coordinates: [number, number]) => {
          const point = map.project(coordinates);
          const width = map.getCanvas().clientWidth;
          return {
            x: Math.max(142, Math.min(width - 142, point.x)),
            y: point.y,
            placeBelow: point.y < 150,
          };
        };

        const showLocationPreview = (locationKey: string, coordinates: [number, number]) => {
          const location = roomLocationsRef.current.get(locationKey);
          if (!location) return;
          hoveredPreviewKey = `location:${locationKey}`;
          setMarkerPreview({
            key: hoveredPreviewKey,
            ...previewPosition(coordinates),
            rooms: location.rooms,
          });
        };

        const showClusterPreview = async (clusterId: number, coordinates: [number, number]) => {
          const source = map.getSource("rooms") as GeoJSONSource | undefined;
          if (!source || !Number.isFinite(clusterId)) return;
          const key = `cluster:${clusterId}`;
          hoveredPreviewKey = key;
          const request = ++previewRequest;
          try {
            const leaves = await source.getClusterLeaves(clusterId, 12, 0);
            if (request !== previewRequest || hoveredPreviewKey !== key) return;
            const previewRooms = leaves.flatMap((leaf) => {
              const locationKey = String(leaf.properties?.locationKey ?? "");
              return roomLocationsRef.current.get(locationKey)?.rooms ?? [];
            });
            if (!previewRooms.length) return;
            setMarkerPreview({ key, ...previewPosition(coordinates), rooms: previewRooms });
          } catch {
            // Cluster zoom/click remains available when preview leaves cannot be read.
          }
        };

        const previewFeature = (feature: ReturnType<typeof map.queryRenderedFeatures>[number]) => {
          if (feature.geometry.type !== "Point") return;
          const coordinates = feature.geometry.coordinates as [number, number];
          const clusterId = Number(feature.properties?.cluster_id);
          if (Number.isFinite(clusterId)) {
            const key = `cluster:${clusterId}`;
            if (hoveredPreviewKey !== key) void showClusterPreview(clusterId, coordinates);
            return;
          }
          const locationKey = String(feature.properties?.locationKey ?? "");
          if (locationKey && hoveredPreviewKey !== `location:${locationKey}`) {
            previewRequest += 1;
            showLocationPreview(locationKey, coordinates);
          }
        };

        const handleMarkerClick = async (event: MapMouseEvent) => {
          const layers = interactiveLayers.filter((layer) => map.getLayer(layer));
          if (!layers.length) return;
          const features = map.queryRenderedFeatures(event.point, { layers });
          const clusterFeature = features.find((feature) => feature.properties?.cluster_id != null);
          if (clusterFeature) {
            const clusterId = Number(clusterFeature.properties?.cluster_id);
            const source = map.getSource("rooms") as GeoJSONSource | undefined;
            if (!source || !Number.isFinite(clusterId)) return;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            if (clusterFeature.geometry.type === "Point") map.easeTo({ center: clusterFeature.geometry.coordinates as [number, number], zoom });
            return;
          }
          const locationFeature = features.find((feature) => feature.properties?.locationKey);
          const locationKey = String(locationFeature?.properties?.locationKey ?? "");
          if (locationKey) {
            const location = roomLocationsRef.current.get(locationKey);
            if (!location) return;
            if (location.rooms.length === 1 && locationFeature?.geometry.type === "Point") {
              const room = location.rooms[0];
              const mobile = window.matchMedia("(hover: none), (pointer: coarse)").matches;
              const previewKey = `location:${locationKey}`;
              if (mobile && mobilePreviewKeyRef.current !== previewKey) {
                mobilePreviewKeyRef.current = previewKey;
                showLocationPreview(locationKey, locationFeature.geometry.coordinates as [number, number]);
                return;
              }
              markRoomViewed(room.id);
              setMarkerPreview(null);
              mobilePreviewKeyRef.current = null;
              router.push(`/rooms/${room.id}`);
              return;
            }
            setMarkerPreview(null);
            mobilePreviewKeyRef.current = null;
            setSelectedId(null);
            setSelectedLocationKey(locationKey);
            return;
          }
          closeMarkerPreview();
        };
        map.on("click", handleMarkerClick);
        map.on("mousemove", (event) => {
          if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
          const layers = interactiveLayers.filter((layer) => map.getLayer(layer));
          if (!layers.length) return;
          const features = map.queryRenderedFeatures(event.point, { layers });
          const feature = features.find((item) => item.properties?.cluster_id != null || item.properties?.locationKey);
          if (!feature) {
            if (hoveredPreviewKey) closeMarkerPreview();
            return;
          }
          map.getCanvas().style.cursor = "pointer";
          previewFeature(feature);
        });
        map.getCanvas().addEventListener("mouseleave", closeMarkerPreview);
        map.on("movestart", closeMarkerPreview);
      };
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => {
        if (!firstStyleReady) setMapError(true);
      });
      map.on("style.load", () => {
        addRoomMapLayers(map, roomFeatureCollectionRef.current);
        addSearchMapLayers(map, searchFocusFeatureRef.current);
        firstStyleReady = true;
        window.clearTimeout(bootTimeout);
        registerInteractions();
        setStyleLoading(false);
        setMapReady(true);
        setMapError(false);
      });
      map.on("load", () => {
        window.clearTimeout(bootTimeout);
        setMapReady(true);
        setMapError(false);
      });
      return () => { window.clearTimeout(bootTimeout); mapRef.current?.remove(); mapRef.current = null; };
    } catch {
      setMapError(true);
    }
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    let animationFrame = 0;
    const animateSearchHighlights = (time: number) => {
      const map = mapRef.current;
      if (!map) return;
      const opacity = 0.38 + ((Math.sin(time / 260) + 1) / 2) * 0.62;
      for (const layerId of ["search-cluster-highlight", "search-room-highlight"]) {
        if (map.getLayer(layerId)) map.setPaintProperty(layerId, "icon-opacity", opacity);
      }
      animationFrame = window.requestAnimationFrame(animateSearchHighlights);
    };
    animationFrame = window.requestAnimationFrame(animateSearchHighlights);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeMapStyleRef.current === mapStyleId) return;

    const previousStyleId = activeMapStyleRef.current;
    const selectedStyle = mapStyleOption(mapStyleId);
    setStyleLoading(true);
    setMapError(false);
    activeMapStyleRef.current = mapStyleId;

    let timeoutId = 0;
    const finishStyleChange = () => {
      window.clearTimeout(timeoutId);
      setStyleLoading(false);
    };
    map.once("style.load", finishStyleChange);
    try {
      map.setStyle(selectedStyle.url, { diff: false });
      timeoutId = window.setTimeout(() => {
        map.off("style.load", finishStyleChange);
        setStyleLoading(false);
        setMapError(true);
      }, 15_000);
    } catch {
      map.off("style.load", finishStyleChange);
      activeMapStyleRef.current = previousStyleId;
      setMapStyleId(previousStyleId);
      setStyleLoading(false);
      setMapError(true);
    }

    return () => {
      window.clearTimeout(timeoutId);
      map.off("style.load", finishStyleChange);
    };
  }, [mapStyleId]);

  useEffect(() => {
    if (!isAnonLocked) return;
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRooms([]);
    setSelectedId(null);
    setSelectedLocationKey(null);
    setLoading(false);
  }, [isAnonLocked]);

  useEffect(() => {
    if (!bounds) return;
    if (isAccessPending || isAnonLocked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController(); abortRef.current = controller;
      setLoading(true); setError(null);
      const query = new URLSearchParams({ west: String(bounds.west), south: String(bounds.south), east: String(bounds.east), north: String(bounds.north) });
      for (const key of ["search", "minPrice", "maxPrice", "district", "roomType", "status"]) { const value = searchParams.get(key); if (value) query.set(key, value); }
      if (nearby) { query.set("lat", String(nearby.latitude)); query.set("lng", String(nearby.longitude)); query.set("radius", String(nearby.radius)); }
      try {
        const response = await fetch(`/api/map/rooms?${query}`, { signal: controller.signal });
        const body = await response.json() as { rooms?: MapRoom[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Không thể tải dữ liệu bản đồ");
        setRooms(body.rooms ?? []);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError(requestError instanceof Error ? requestError.message : "Mất kết nối");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [bounds, isAccessPending, isAnonLocked, nearby, searchParams]);

  useEffect(() => {
    roomLocationsRef.current = new Map(roomLocations.map((location) => [location.key, location]));
    const nextData: RoomFeatureCollection = {
      type: "FeatureCollection",
      features: roomLocations.map((location) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
        properties: {
          locationKey: location.key,
          roomCount: location.rooms.length,
          markerLabel: location.rooms.length === 1
            ? markerPriceLabel(location.rooms[0].price)
            : String(location.rooms.length),
          statusTone: location.rooms.length === 1
            ? roomStatusTone(location.rooms[0].status)
            : "available",
          viewed: location.rooms.length === 1 && viewedRoomIds.has(location.rooms[0].id),
          searchMatch: Boolean(searchFocus && location.rooms.some((room) => roomMatchesPlaceQuery(room, searchFocus))),
        },
      })),
    };
    roomFeatureCollectionRef.current = nextData;
    const source = mapRef.current?.getSource("rooms") as GeoJSONSource | undefined;
    source?.setData(nextData);
    if (selectedId && !rooms.some((room) => room.id === selectedId)) setSelectedId(null);
    if (selectedLocationKey && !roomLocations.some((location) => location.key === selectedLocationKey)) {
      setSelectedLocationKey(null);
    }
  }, [roomLocations, rooms, searchFocus, selectedId, selectedLocationKey, viewedRoomIds]);

  useEffect(() => {
    const nextData: SearchFocusFeatureCollection = searchFocus ? {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [searchFocus.longitude, searchFocus.latitude] },
        properties: {},
      }],
    } : EMPTY_SEARCH_FOCUS;
    searchFocusFeatureRef.current = nextData;
    const source = mapRef.current?.getSource("search-focus") as GeoJSONSource | undefined;
    source?.setData(nextData);
  }, [searchFocus]);

  function chooseMapStyle(id: MapStyleId) {
    setMapStyleId(id);
    setStyleMenuOpen(false);
    try {
      localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
    } catch {
      // The selected style still works for the current session.
    }
  }

  async function searchPlace() {
    const query = placeQuery.trim();
    if (query.length < 3) { setPlaces([]); return; }
    setPlaceLoading(true);
    try {
      const mapCenter = mapRef.current?.getCenter();
      const fallbackOrigin = mapCenter ? { latitude: mapCenter.lat, longitude: mapCenter.lng } : { latitude: DEFAULT_CENTER[1], longitude: DEFAULT_CENTER[0] };
      const origin = nearby
        ? { latitude: nearby.latitude, longitude: nearby.longitude }
        : searchOriginRef.current ?? await new Promise<{ latitude: number; longitude: number }>((resolve) => {
          if (!navigator.geolocation) { searchOriginRef.current = fallbackOrigin; resolve(fallbackOrigin); return; }
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              const position = { latitude: coords.latitude, longitude: coords.longitude };
              searchOriginRef.current = position;
              resolve(position);
            },
            () => { searchOriginRef.current = fallbackOrigin; resolve(fallbackOrigin); },
            { enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 },
          );
        });
      const params = new URLSearchParams({ q: query, lat: String(origin.latitude), lng: String(origin.longitude) });
      const response = await fetch(`/api/geocode?${params}`);
      const body = await response.json() as { results?: Place[] };
      setPlaces(body.results ?? []);
    }
    catch { setPlaces([]); } finally { setPlaceLoading(false); }
  }

  function focusPlaceSearchResult(place: Place) {
    const query = placeQuery.trim();
    const addressTypes = ["house", "residential", "road", "street", "pedestrian", "primary", "secondary", "tertiary", "unclassified", "service"];
    const addressLike = place.category === "highway" || place.category === "building" || addressTypes.includes(place.type ?? "") || /\d/.test(query);
    setPlaceQuery(place.label);
    setPlaces([]);
    setSearchFocus({ ...place, query, addressLike });
    mapRef.current?.flyTo({ center: [place.longitude, place.latitude], zoom: 15 });
  }

  function locateMe() {
    setGeoMessage(null);
    if (!navigator.geolocation) { setGeoMessage("Thiết bị không hỗ trợ định vị."); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { latitude: coords.latitude, longitude: coords.longitude, radius: nearby?.radius ?? 3 };
      searchOriginRef.current = { latitude: coords.latitude, longitude: coords.longitude };
      setNearby(next); mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 14 });
    }, (reason) => setGeoMessage(reason.code === 1 ? "Bạn đã từ chối quyền vị trí. Bản đồ vẫn dùng bình thường." : "Không xác định được vị trí. Vui lòng thử lại."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function focusRoom(room: MapRoom) {
    setSelectedId(room.id);
    setSelectedLocationKey(null);
    mapRef.current?.easeTo({ center: [room.longitude, room.latitude], zoom: Math.max(mapRef.current.getZoom(), 14) });
  }

  return (
    <main className={`relative h-[calc(100dvh-48px)] min-h-[620px] overflow-hidden bg-[#20150f] text-[#3f2f24] transition-[grid-template-columns] duration-300 lg:grid ${resultsPanelCollapsed ? "lg:grid-cols-[0px_1fr]" : "lg:grid-cols-[390px_1fr]"}`}>
      <aside className={`absolute inset-x-2 bottom-2 z-20 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#aa825d]/30 bg-[#fff9ef]/95 p-3 shadow-2xl backdrop-blur transition-[max-height,transform] duration-300 lg:static lg:w-[390px] lg:max-h-none lg:rounded-none lg:border-y-0 lg:border-l-0 lg:p-4 ${resultsPanelCollapsed ? "max-h-[18rem] lg:pointer-events-none lg:-translate-x-full" : "max-h-[72dvh] translate-x-0"}`}>
        <div className="shrink-0" aria-label="Tìm kiếm và bộ lọc phòng">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href="/" className="text-lg font-black text-[#5d381f]">The Room SG</Link>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#80634a]">{loading ? "Đang tải…" : `${rooms.length} phòng trong vùng`}</span>
            <button
              type="button"
              aria-label={resultsPanelCollapsed ? "Mở rộng danh sách phòng" : "Thu gọn danh sách phòng"}
              title={resultsPanelCollapsed ? "Mở rộng danh sách phòng" : "Thu gọn danh sách phòng"}
              onClick={() => setResultsPanelCollapsed((collapsed) => !collapsed)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#aa825d]/30 bg-white text-[#5d381f] transition hover:bg-[#f3e1c9]"
            >
              {resultsPanelCollapsed ? <ChevronUp size={17} className="lg:hidden" /> : <ChevronDown size={17} className="lg:hidden" />}
              <ChevronLeft size={17} className="hidden lg:block" />
            </button>
          </div>
        </div>
        <form className="relative rounded-2xl border border-[#aa825d]/30 bg-white/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" onSubmit={(event) => { event.preventDefault(); void searchPlace(); }}>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#80634a]" size={17} />
          <input
            value={placeQuery}
            onChange={(event) => {
              setPlaceQuery(event.target.value);
              if (searchFocus && event.target.value !== searchFocus.label) setSearchFocus(null);
            }}
            placeholder="Tìm địa điểm…"
            className="h-10 w-full rounded-xl border-0 bg-transparent pl-9 pr-16 text-sm outline-none placeholder:text-[#9b8978] focus:bg-white/60"
          />
          <button type="submit" disabled={placeLoading} className="absolute right-1.5 top-1.5 grid h-9 min-w-12 place-items-center rounded-xl bg-[#744722] px-2.5 text-xs font-bold text-white shadow-sm">{placeLoading ? <Loader2 className="animate-spin" size={15} /> : "Tìm"}</button>
          {places.length ? <div className="absolute z-30 mt-1 max-h-[50dvh] w-full overflow-y-auto overscroll-contain rounded-xl border bg-white shadow-xl sm:max-h-96">{places.map((place) => <button key={place.id} type="button" onClick={() => focusPlaceSearchResult(place)} className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-[#f3e1c9]">{place.label}</button>)}</div> : null}
        </form>
        <div className="my-3 flex gap-2"><button type="button" onClick={locateMe} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#744722] px-3 py-2 text-sm font-bold text-white"><Crosshair size={17} /> Gần tôi</button><button type="button" aria-expanded={filtersOpen} onClick={() => { if (resultsPanelCollapsed) setResultsPanelCollapsed(false); setFiltersOpen((open) => !open); }} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${filtersOpen ? "border-[#744722] bg-[#f3e1c9]" : "border-[#aa825d]/40 bg-white"}`}><SlidersHorizontal size={17} /> Bộ lọc</button></div>
        {activeFilterLabels.length || resultsPanelCollapsed ? (
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Bộ lọc đang áp dụng">
            {activeFilterLabels.length ? activeFilterLabels.map((label) => <span key={label} title={label} className="max-w-full shrink-0 truncate rounded-full border border-[#aa825d]/25 bg-[#f3e1c9] px-2.5 py-1 text-[10px] font-semibold text-[#68452d]">{label}</span>) : <span className="rounded-full border border-dashed border-[#aa825d]/30 px-2.5 py-1 text-[10px] text-[#80634a]">Chưa áp dụng bộ lọc</span>}
          </div>
        ) : null}
        {nearby ? <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#f3e1c9] p-2 text-xs"><MapPin size={15} /><select value={nearby.radius} onChange={(e) => setNearby({ ...nearby, radius: Number(e.target.value) })} className="flex-1 bg-white px-2 py-1">{[1,2,3,5,10].map((radius) => <option key={radius} value={radius}>Trong {radius} km</option>)}</select><button onClick={() => setNearby(null)} aria-label="Tắt gần tôi"><X size={16} /></button></div> : null}
        {filtersOpen ? (
          <div className={`mb-3 max-h-[38dvh] space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-[#aa825d]/25 bg-[#fffaf2] p-2 lg:max-h-[55dvh] ${resultsPanelCollapsed ? "hidden lg:block" : ""}`}>
            <MapPriceRange
              key={`${appliedPriceRange[0]}-${appliedPriceRange[1]}`}
              value={appliedPriceRange}
              active={hasPriceFilter}
              onCommit={([min, max]) => setParams({ minPrice: String(min), maxPrice: String(max) })}
              onClear={() => setParams({ minPrice: "", maxPrice: "" })}
            />
            <div className="grid grid-cols-3 gap-2" aria-label="Bộ lọc quận, loại phòng và trạng thái">
              <button type="button" aria-haspopup="dialog" aria-expanded={openOptionGroup === "district"} onClick={() => setOpenOptionGroup("district")} className={`flex min-w-0 items-center justify-between gap-1 rounded-xl border px-3 py-2.5 text-left text-xs font-bold text-[#5d381f] ${selectedDistricts.length ? "border-[#744722] bg-[#ead8c0]" : "border-[#aa825d]/25 bg-white/75"}`}><span className="truncate">Quận{selectedDistricts.length ? ` (${selectedDistricts.length})` : ""}</span><ChevronDown size={15} className="shrink-0" /></button>
              <button type="button" aria-haspopup="dialog" aria-expanded={openOptionGroup === "roomType"} onClick={() => setOpenOptionGroup("roomType")} className={`flex min-w-0 items-center justify-between gap-1 rounded-xl border px-3 py-2.5 text-left text-xs font-bold text-[#5d381f] ${selectedRoomTypes.length ? "border-[#744722] bg-[#ead8c0]" : "border-[#aa825d]/25 bg-white/75"}`}><span className="truncate">Loại phòng{selectedRoomTypes.length ? ` (${selectedRoomTypes.length})` : ""}</span><ChevronDown size={15} className="shrink-0" /></button>
              <button type="button" aria-haspopup="dialog" aria-expanded={openOptionGroup === "status"} onClick={() => setOpenOptionGroup("status")} className="flex min-w-0 items-center justify-between gap-1 rounded-xl border border-[#744722] bg-[#ead8c0] px-3 py-2.5 text-left text-xs font-bold text-[#5d381f]"><span className="truncate">Trạng thái{allStatusesSelected ? "" : ` (${selectedStatuses.length})`}</span><ChevronDown size={15} className="shrink-0" /></button>
            </div>
          </div>
        ) : null}
        </div>
        <div className={`${resultsPanelCollapsed ? "hidden lg:block" : ""} min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1`} aria-label="Danh sách phòng trong vùng bản đồ">
          {geoMessage ? <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{geoMessage}</p> : null}{error ? <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}
          <div className="space-y-2">{rooms.slice(0, 100).map((room) => <article key={room.id} onClick={() => focusRoom(room)} className={`flex cursor-pointer gap-3 rounded-xl border p-2 transition ${selectedId === room.id ? "border-[#744722] bg-[#f3e1c9]" : "border-[#aa825d]/20 bg-white"}`}>{room.thumbnail ? <img src={room.thumbnail} loading="lazy" alt="" className="h-16 w-20 rounded-lg object-cover" /> : <div className="grid h-16 w-20 place-items-center rounded-lg bg-[#ead8c0]"><MapPin size={20} /></div>}<div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h2 className="truncate text-sm font-bold">{[room.room_code, room.room_type].filter(Boolean).join(" | ") || "Phòng cho thuê"}</h2><strong className="whitespace-nowrap text-sm text-[#744722]">{priceLabel(room.price)}</strong></div><p className="mt-1 truncate text-xs text-[#80634a]">{[room.address, room.ward, room.district].filter(Boolean).join(", ")}</p><Link href={`/rooms/${room.id}`} onClick={(e) => { e.stopPropagation(); markRoomViewed(room.id); }} className="mt-1 inline-block text-xs font-bold text-[#744722] hover:underline">Xem chi tiết</Link></div></article>)}{!loading && rooms.length === 0 ? <p className="py-6 text-center text-sm text-[#80634a]">Chưa có phòng có tọa độ trong khu vực này.</p> : null}</div>
        </div>
      </aside>
      {resultsPanelCollapsed ? (
        <button
          type="button"
          aria-label="Mở danh sách phòng"
          title="Mở danh sách phòng"
          onClick={() => setResultsPanelCollapsed(false)}
          className="absolute left-0 top-1/2 z-40 hidden h-12 w-8 -translate-y-1/2 place-items-center rounded-r-xl border border-l-0 border-[#aa825d]/40 bg-[#fff9ef]/95 text-[#5d381f] shadow-xl backdrop-blur transition hover:w-9 hover:bg-white lg:grid"
        >
          <ChevronRight size={19} />
        </button>
      ) : null}
      <section className="relative h-full min-h-[620px]">
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" aria-label="Bản đồ phòng cho thuê" />
        </div>
        <div
          ref={styleMenuRef}
          className="absolute right-3 z-30 transition-[top] duration-200"
          style={{ top: selectedLocationRooms.length ? (roomListPanelBottom ?? "calc(42dvh + 5rem)") : 80 }}
        >
          <button
            type="button"
            aria-label="Chọn lớp bản đồ"
            aria-expanded={styleMenuOpen}
            onClick={() => setStyleMenuOpen((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#aa825d]/35 bg-[#fff9ef]/95 text-[#4d3422] shadow-lg backdrop-blur transition hover:bg-white"
          >
            {styleLoading ? <Loader2 size={14} className="animate-spin" /> : <Layers3 size={14} />}
          </button>
          {styleMenuOpen ? (
            <div className="mt-2 w-60 rounded-2xl border border-[#aa825d]/35 bg-[#fff9ef]/98 p-2.5 shadow-2xl backdrop-blur" role="menu" aria-label="Các lớp bản đồ miễn phí">
              <div className="mb-2 flex items-center justify-between px-1">
                <strong className="text-xs text-[#4d3422]">Chọn giao diện</strong>
                <span className="text-[10px] font-semibold text-[#80634a]">OpenFreeMap</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {MAP_STYLE_OPTIONS.map((option) => {
                  const active = option.id === mapStyleId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      data-map-style={option.id}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => chooseMapStyle(option.id)}
                      className={`relative flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition ${active ? "border-[#744722] bg-[#f3e1c9]" : "border-[#aa825d]/20 bg-white hover:bg-[#f7ead9]"}`}
                    >
                      <span
                        className="h-8 w-8 shrink-0 rounded-lg border border-black/10"
                        style={{ background: `linear-gradient(135deg, ${option.colors[0]}, ${option.colors[1]})` }}
                      />
                      <span className="min-w-0">
                        <strong className="block truncate text-[11px] text-[#4d3422]">{option.label}</strong>
                        <span className="block truncate text-[9px] text-[#80634a]">{option.description}</span>
                      </span>
                      {active ? <Check size={12} className="absolute right-1.5 top-1.5 text-[#744722]" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        {!mapReady && !mapError ? (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold shadow">
            <Loader2 className="animate-spin" size={16} /> Đang tải nền bản đồ
          </div>
        ) : loading ? (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold shadow">
            <Loader2 className="animate-spin" size={16} /> Đang tìm phòng
          </div>
        ) : null}
        {mapError ? (
          <div className="absolute left-1/2 top-20 z-10 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 shadow">
            Không tải được nền bản đồ. <button type="button" onClick={() => window.location.reload()} className="font-bold underline">Tải lại</button>
          </div>
        ) : null}
        {markerPreview ? (
          <aside
            aria-label={markerPreview.rooms.length === 1 ? "Xem nhanh phòng" : `Xem nhanh ${markerPreview.rooms.length} phòng`}
            className="pointer-events-none absolute z-30 w-[min(17rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-[#aa825d]/35 bg-white/98 shadow-2xl backdrop-blur"
            style={{
              left: markerPreview.x,
              top: markerPreview.placeBelow ? markerPreview.y + 12 : markerPreview.y - 48,
              transform: markerPreview.placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
          >
            {markerPreview.rooms.length === 1 ? (() => {
              const room = markerPreview.rooms[0];
              return (
                <div className="flex gap-2.5 p-2.5">
                  {room.thumbnail ? (
                    <img src={room.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[#ead8c0] text-[#744722]"><MapPin size={20} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-[#4d3422]">{[room.address, room.ward, room.district].filter(Boolean).join(", ") || "Phòng cho thuê"}</strong>
                    <p className="mt-1 truncate text-xs text-[#80634a]">{room.room_type || "Chưa cập nhật loại phòng"}</p>
                    <p className="mt-1 text-sm font-black text-[#744722]">{markerPriceLabel(room.price)} <span className="text-[11px] font-medium text-[#80634a]">/ tháng</span></p>
                  </div>
                </div>
              );
            })() : (
              <div className="p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#aa825d]/20 pb-2">
                  <strong className="text-sm text-[#4d3422]">{markerPreview.rooms.length} phòng tại vị trí này</strong>
                  <span className="text-[10px] font-semibold text-[#80634a]">Bấm để xem danh sách</span>
                </div>
                <div className="space-y-1.5">
                  {markerPreview.rooms.slice(0, 5).map((room) => (
                    <div key={room.id} className="flex items-center gap-2 rounded-lg bg-[#fff9ef] p-1.5">
                      {room.thumbnail ? <img src={room.thumbnail} alt="" className="h-9 w-10 shrink-0 rounded-md object-cover" /> : <div className="grid h-9 w-10 shrink-0 place-items-center rounded-md bg-[#ead8c0]"><MapPin size={15} /></div>}
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-[#4d3422]">{[room.room_code, room.room_type].filter(Boolean).join(" | ") || "Phòng cho thuê"}</strong>
                        <span className="block truncate text-[10px] text-[#80634a]">{[room.address, room.ward, room.district].filter(Boolean).join(", ")}</span>
                      </div>
                      <strong className="shrink-0 text-xs text-[#744722]">{markerPriceLabel(room.price)}</strong>
                    </div>
                  ))}
                  {markerPreview.rooms.length > 5 ? <p className="text-center text-[10px] font-semibold text-[#80634a]">Và {markerPreview.rooms.length - 5} phòng khác</p> : null}
                </div>
              </div>
            )}
          </aside>
        ) : null}
        {selectedLocationRooms.length ? (
          <section
            ref={roomListPanelRef}
            aria-label={`${selectedLocationRooms.length} phòng tại vị trí đã chọn`}
            className="absolute left-1/2 top-3 z-20 w-[min(21rem,calc(100%-1rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#aa825d]/35 bg-[#fff9ef]/97 shadow-2xl backdrop-blur"
          >
            <header className="flex items-start justify-between gap-2 border-b border-[#aa825d]/20 px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-[#4d3422]">{selectedLocationRooms.length} phòng tại vị trí này</h2>
                <p className="mt-0.5 truncate text-[11px] text-[#80634a]">
                  {[selectedLocationRooms[0]?.address, selectedLocationRooms[0]?.ward, selectedLocationRooms[0]?.district].filter(Boolean).join(", ")}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng danh sách phòng"
                onClick={() => { setSelectedLocationKey(null); setSelectedId(null); }}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ead8c0] text-[#5d381f]"
              >
                <X size={15} />
              </button>
            </header>
            <div className="max-h-[42dvh] space-y-1.5 overflow-y-auto p-2">
              {selectedLocationRooms.map((room) => {
                const viewed = viewedRoomIds.has(room.id);
                return (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    onClick={() => markRoomViewed(room.id)}
                    aria-label={`Xem phòng ${room.room_code || room.room_type || "-"}`}
                    data-viewed={viewed ? "true" : "false"}
                    className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors ${
                      selectedId === room.id
                        ? "border-[#744722] bg-white ring-2 ring-[#744722]/20"
                        : viewed
                          ? "border-[#9b8269]/40 bg-[#e8dfd3]"
                          : "border-[#aa825d]/20 bg-[#fff9ef] hover:bg-[#f3e1c9]/70"
                    }`}
                  >
                    {room.thumbnail ? (
                      <img src={room.thumbnail} alt="" className="h-11 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="grid h-11 w-12 shrink-0 place-items-center rounded-md bg-[#ead8c0] text-[#744722]">
                        <MapPin size={16} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs text-[#4d3422]">
                        {[room.room_code, room.room_type].filter(Boolean).join(" | ") || "Phòng cho thuê"}
                      </strong>
                      <span className="mt-0.5 block truncate text-[10px] text-[#80634a]">
                        {[room.address, room.ward, room.district].filter(Boolean).join(", ") || "Chưa cập nhật địa chỉ"}
                      </span>
                    </span>
                    <strong className="shrink-0 text-xs text-[#744722]">{markerPriceLabel(room.price)}</strong>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
      {openOptionGroup && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#2b1b12]/35 p-3 backdrop-blur-[1px] sm:items-center"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpenOptionGroup(null);
          }}
          aria-label="Đóng bảng chọn khi bấm hoặc vuốt bên ngoài"
        >
          <section role="dialog" aria-modal="true" aria-labelledby="map-option-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-[#aa825d]/35 bg-[#fff9ef] shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-[#aa825d]/20 px-4 py-3">
              <div className="min-w-0">
                <h2 id="map-option-dialog-title" className="text-sm font-black text-[#4d3422]">{openOptionGroup === "district" ? "Chọn quận" : openOptionGroup === "roomType" ? "Chọn loại phòng" : "Chọn trạng thái phòng"}</h2>
                <p className="mt-0.5 text-[11px] text-[#80634a]">Có thể chọn nhiều lựa chọn</p>
              </div>
              <button type="button" aria-label="Đóng bảng chọn" onClick={() => setOpenOptionGroup(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ead8c0] text-[#5d381f]"><X size={16} /></button>
            </header>
            <div className="max-h-[55dvh] overflow-y-auto overscroll-contain p-3">
              <div className="grid grid-cols-2 gap-2">
                {(openOptionGroup === "district" ? DISTRICT_OPTIONS : openOptionGroup === "roomType" ? ROOM_TYPE_OPTIONS : ["Tất cả", ...ROOM_STATUS_OPTIONS]).map((option) => {
                  const active = openOptionGroup === "district"
                    ? selectedDistricts.includes(option)
                    : openOptionGroup === "roomType"
                      ? selectedRoomTypes.includes(option)
                      : option === "Tất cả" ? allStatusesSelected : selectedStatuses.includes(option);
                  const selectOption = () => {
                    if (openOptionGroup === "status") toggleStatusFilter(option === "Tất cả" ? "all" : option as (typeof ROOM_STATUS_OPTIONS)[number]);
                    else toggleListFilter(openOptionGroup, option);
                  };
                  return <button key={option} type="button" aria-pressed={active} onClick={selectOption} className={`flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${active ? "border-[#744722] bg-[#ead8c0] font-bold text-[#4d3422]" : "border-[#aa825d]/20 bg-white text-[#5d381f] hover:bg-[#f3e1c9]/60"}`}><span className="truncate">{option}</span>{active ? <Check size={14} className="shrink-0" /> : null}</button>;
                })}
              </div>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-[#aa825d]/20 px-3 py-2.5">
              <button type="button" onClick={() => setParams(openOptionGroup === "district" ? { district: "" } : openOptionGroup === "roomType" ? { roomType: "" } : { status: "" })} className="rounded-lg px-3 py-2 text-xs font-bold text-[#744722]">{openOptionGroup === "status" ? "Mặc định" : "Xóa lựa chọn"}</button>
              <button type="button" onClick={() => setOpenOptionGroup(null)} className="rounded-xl bg-[#744722] px-5 py-2 text-xs font-bold text-white">Xong</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
      {isAnonLocked && !hasVipAccess ? (
        <AnonymousLockModal
          phone="0967.467.587"
          zaloUrl="https://zalo.me/0967467587"
        />
      ) : null}
    </main>
  );
}
