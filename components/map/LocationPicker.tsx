"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin } from "lucide-react";
import maplibregl, { type Map as MapLibreMap, type Marker as MapLibreMarker } from "maplibre-gl";

const BASE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Location = { latitude: number; longitude: number };

const DEFAULT_CENTER: [number, number] = [106.6819, 10.7626];

export default function LocationPicker({
  value,
  onChange,
  addressQuery,
  heightClassName = "h-72",
  showAddressSuggestion = true,
}: {
  value: Location | null;
  onChange: (location: Location | null) => void;
  addressQuery?: string;
  heightClassName?: string;
  showAddressSuggestion?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const placeMarkerRef = useRef<(lng: number, lat: number) => void>(() => undefined);
  const onChangeRef = useRef(onChange);
  const [mapError, setMapError] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const center: [number, number] = value
        ? [value.longitude, value.latitude]
        : DEFAULT_CENTER;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_MAP_STYLE,
        center,
        zoom: value ? 16 : 11,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setMapError(true));

      const placeMarker = (lng: number, lat: number) => {
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ draggable: true, color: "#744722" })
            .setLngLat([lng, lat])
            .addTo(map);
          markerRef.current.on("dragend", () => {
            const point = markerRef.current?.getLngLat();
            if (point) onChangeRef.current({ latitude: point.lat, longitude: point.lng });
          });
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
      };
      placeMarkerRef.current = placeMarker;
      if (value) placeMarker(value.longitude, value.latitude);
      map.on("click", ({ lngLat }) => {
        placeMarker(lngLat.lng, lngLat.lat);
        onChangeRef.current({ latitude: lngLat.lat, longitude: lngLat.lng });
      });
      return () => {
        markerRef.current?.remove();
        markerRef.current = null;
        mapRef.current?.remove();
        mapRef.current = null;
      };
    } catch {
      setMapError(true);
    }
  }, []); // The picker owns map state after its initial mount.

  useEffect(() => {
    if (!mapRef.current) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    placeMarkerRef.current(value.longitude, value.latitude);
    mapRef.current.flyTo({ center: [value.longitude, value.latitude], zoom: 16 });
  }, [value]);

  async function suggestFromAddress() {
    const query = String(addressQuery ?? "").trim();
    if (query.length < 3) {
      setGeocodeMessage("Hãy nhập địa chỉ tòa nhà trước.");
      return;
    }
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = await response.json() as { results?: Array<{ latitude: number; longitude: number }>; error?: string };
      const result = body.results?.[0];
      if (!response.ok || !result) throw new Error(body.error || "Không tìm thấy vị trí phù hợp.");
      onChange({ latitude: result.latitude, longitude: result.longitude });
      placeMarkerRef.current(result.longitude, result.latitude);
      mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 16 });
      setGeocodeMessage("Đã gợi ý vị trí. Hãy kéo pin nếu cần chỉnh chính xác.");
    } catch (error) {
      setGeocodeMessage(error instanceof Error ? error.message : "Không thể tìm vị trí lúc này.");
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#4d3422]"><MapPin size={17} /> Vị trí trên bản đồ</h2>
          <p className="mt-1 text-xs text-[#80634a]">Chạm bản đồ để đặt vị trí, sau đó kéo dấu ghim để chỉnh chính xác.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {showAddressSuggestion ? (
            <button type="button" disabled={geocoding} onClick={suggestFromAddress} className="inline-flex items-center gap-1 rounded-lg bg-[#744722] px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              {geocoding ? <Loader2 className="animate-spin" size={14} /> : <LocateFixed size={14} />} Gợi ý từ địa chỉ
            </button>
          ) : null}
          {value ? <button type="button" onClick={() => { markerRef.current?.remove(); markerRef.current = null; onChange(null); }} className="px-2 py-1 text-xs font-semibold text-red-700">Xóa vị trí</button> : null}
        </div>
      </div>
      <div ref={containerRef} className={`${heightClassName} overflow-hidden rounded-xl bg-[#ead8c0]`} aria-label="Chọn vị trí tòa nhà" />
      {value ? <p className="font-mono text-xs text-[#684324]">{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p> : <p className="text-xs text-[#80634a]">Chưa có vị trí. Tòa nhà sẽ chưa xuất hiện trong Map Search.</p>}
      {geocodeMessage ? <p className="text-xs font-medium text-[#684324]">{geocodeMessage}</p> : null}
      {mapError ? <p role="alert" className="text-xs text-red-700">Không tải được nền bản đồ. Bạn vẫn có thể lưu các thông tin khác.</p> : null}
    </section>
  );
}
