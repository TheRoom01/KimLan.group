"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

const DEFAULT_CENTER = { lat: 10.7769, lng: 106.7009 };

const TEST_ROOMS = [
  { code: "TEST-Q1-01", price: "3,5 Tr", address: "Bến Nghé, Quận 1", position: { lat: 10.7793, lng: 106.6992 } },
  { code: "TEST-Q3-02", price: "5 Tr", address: "Võ Thị Sáu, Quận 3", position: { lat: 10.7824, lng: 106.6905 } },
  { code: "TEST-Q4-03", price: "7,2 Tr", address: "Phường 6, Quận 4", position: { lat: 10.7574, lng: 106.7042 } },
  { code: "TEST-BT-04", price: "4,8 Tr", address: "Phường 17, Bình Thạnh", position: { lat: 10.8019, lng: 106.7105 } },
  { code: "TEST-PN-05", price: "6,5 Tr", address: "Phường 2, Phú Nhuận", position: { lat: 10.7981, lng: 106.6792 } },
] as const;

type MapType = "roadmap" | "satellite" | "hybrid";

type SelectedPlace = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

let loaderConfigured = false;

function readableGoogleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/gm_authFailure/i.test(message)) return message;
  if (/billing/i.test(message)) return `Billing chưa active hoặc không hợp lệ: ${message}`;
  if (/referer|referrer|restriction|denied/i.test(message)) return `API key hoặc website restriction không hợp lệ: ${message}`;
  if (/ApiNotActivated|not activated/i.test(message)) return `Google Maps API cần thiết chưa được bật: ${message}`;
  return `Google Maps Platform lỗi: ${message}`;
}

function priceMarkerElement(price: string) {
  const element = document.createElement("div");
  element.textContent = `🛏 ${price}`;
  element.style.cssText = [
    "padding:7px 11px",
    "border-radius:999px",
    "border:2px solid #fff",
    "background:#744722",
    "color:#fff",
    "font:800 13px/1.1 system-ui,sans-serif",
    "white-space:nowrap",
    "box-shadow:0 4px 14px rgba(0,0,0,.38)",
  ].join(";");
  return element;
}

function selectedMarkerElement() {
  const element = document.createElement("div");
  element.textContent = "●";
  element.style.cssText = [
    "width:30px",
    "height:30px",
    "display:grid",
    "place-items:center",
    "border-radius:50%",
    "border:3px solid #fff",
    "background:#2563eb",
    "color:#fff",
    "font:900 15px/1 system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.45)",
  ].join(";");
  return element;
}

export default function GoogleMapsTestClient({ apiKey }: { apiKey: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const searchedMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [status, setStatus] = useState("Đang tải Google Maps Platform…");
  const [error, setError] = useState<string | null>(
    apiKey ? null : "Thiếu NEXT_PUBLIC_GOOGLE_MAPS_API_KEY trong environment variables.",
  );

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current || !autocompleteContainerRef.current) return;

    let cancelled = false;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;
    let infoWindow: google.maps.InfoWindow | null = null;
    const roomMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    const previousAuthFailure = window.gm_authFailure;

    const reportError = (failure: unknown) => {
      const message = readableGoogleError(failure);
      console.error("[GOOGLE MAPS TEST]", failure);
      if (!cancelled) {
        setError(message);
        setStatus("Không thể khởi tạo đầy đủ Google Maps Platform.");
      }
    };

    window.gm_authFailure = () => {
      reportError(new Error("Google Maps authentication failed (gm_authFailure). Kiểm tra website restriction, API activation và billing của project."));
    };

    void (async () => {
      try {
        if (!loaderConfigured) {
          setOptions({ key: apiKey, v: "weekly", language: "vi", region: "VN" });
          loaderConfigured = true;
        }

        const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }] =
          await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
            importLibrary("places"),
          ]);

        if (cancelled || !mapContainerRef.current || !autocompleteContainerRef.current) return;

        const map = new Map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 13,
          mapId: "DEMO_MAP_ID",
          mapTypeId: "roadmap",
          mapTypeControl: false,
          streetViewControl: true,
          fullscreenControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        infoWindow = new InfoWindow();

        for (const room of TEST_ROOMS) {
          const marker = new AdvancedMarkerElement({
            map,
            position: room.position,
            title: `${room.code} · ${room.price}`,
            content: priceMarkerElement(room.price),
            gmpClickable: true,
          });
          marker.addEventListener("gmp-click", () => {
            infoWindow?.setContent(
              `<div style="min-width:180px;color:#2f1c10;font:14px/1.5 system-ui,sans-serif"><strong>${room.code}</strong><br>Giá: ${room.price}<br>${room.address}</div>`,
            );
            infoWindow?.open({ map, anchor: marker });
          });
          roomMarkers.push(marker);
        }

        autocomplete = new PlaceAutocompleteElement({
          placeholder: "Tìm địa chỉ...",
          includedRegionCodes: ["vn"],
          requestedLanguage: "vi",
          requestedRegion: "vn",
          locationBias: { center: DEFAULT_CENTER, radius: 60_000 },
        });
        autocomplete.style.width = "100%";
        autocompleteContainerRef.current.replaceChildren(autocomplete);

        autocomplete.addEventListener("gmp-error", () => {
          reportError(new Error("Places Autocomplete không tải được gợi ý. Kiểm tra Places API (New), restriction và billing."));
        });

        autocomplete.addEventListener("gmp-select", async (event) => {
          try {
            setError(null);
            setStatus("Đang lấy chi tiết địa chỉ…");
            const place = event.placePrediction.toPlace();
            await place.fetchFields({
              fields: ["id", "formattedAddress", "location", "viewport"],
            });
            if (!place.location) throw new Error("Địa chỉ đã chọn không có tọa độ.");

            const latitude = place.location.lat();
            const longitude = place.location.lng();
            const result = {
              formattedAddress: place.formattedAddress ?? "Không có formatted_address",
              latitude,
              longitude,
              placeId: place.id ?? "Không có place_id",
            };

            if (searchedMarkerRef.current) searchedMarkerRef.current.map = null;
            searchedMarkerRef.current = new AdvancedMarkerElement({
              map,
              position: place.location,
              title: result.formattedAddress,
              content: selectedMarkerElement(),
            });

            if (place.viewport) map.fitBounds(place.viewport);
            map.setCenter(place.location);
            map.setZoom(18);
            setSelectedPlace(result);
            setStatus("Places Autocomplete và Place Details hoạt động.");
          } catch (placeError) {
            reportError(placeError);
          }
        });

        setStatus("Google Maps, Places API (New) và marker test đã sẵn sàng.");
        setError(null);
      } catch (loadError) {
        reportError(loadError);
      }
    })();

    return () => {
      cancelled = true;
      roomMarkers.forEach((marker) => {
        marker.map = null;
      });
      if (searchedMarkerRef.current) searchedMarkerRef.current.map = null;
      searchedMarkerRef.current = null;
      infoWindow?.close();
      autocomplete?.remove();
      mapRef.current = null;
      window.gm_authFailure = previousAuthFailure;
    };
  }, [apiKey]);

  function changeMapType(nextType: MapType) {
    mapRef.current?.setMapTypeId(nextType);
    setMapType(nextType);
  }

  return (
    <main className="min-h-dvh bg-[#f4eadc] px-3 py-4 text-[#3f2919] sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl border border-[#b88b62]/30 bg-white/85 p-4 shadow-sm sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#91613b]">Môi trường độc lập</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Google Maps Platform Test</h1>
          <p className="mt-2 text-sm text-[#74583f]">Không sử dụng Supabase và không kết nối với MapLibre/OpenFreeMap production.</p>
        </header>

        {error ? (
          <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
            <strong className="block">Google Maps test gặp lỗi</strong>
            <span className="mt-1 block break-words">{error}</span>
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#b88b62]/30 bg-white p-3 shadow-sm sm:p-4">
          <label className="mb-2 block text-sm font-extrabold" htmlFor="google-places-test">Tìm địa chỉ tại Việt Nam</label>
          <div id="google-places-test" ref={autocompleteContainerRef} className="min-h-12 w-full rounded-xl border border-[#b88b62]/35 bg-white p-1" />
          <p className="mt-2 text-xs text-[#80634a]">Thử: 123 Nguyễn Trãi. Kết quả được giới hạn tại Việt Nam và ưu tiên quanh TP.HCM.</p>

          {selectedPlace ? (
            <dl className="mt-3 grid gap-2 rounded-xl bg-[#fff7eb] p-3 text-sm sm:grid-cols-[150px_1fr]">
              <dt className="font-bold">formatted_address</dt><dd className="break-words">{selectedPlace.formattedAddress}</dd>
              <dt className="font-bold">latitude</dt><dd className="font-mono">{selectedPlace.latitude.toFixed(7)}</dd>
              <dt className="font-bold">longitude</dt><dd className="font-mono">{selectedPlace.longitude.toFixed(7)}</dd>
              <dt className="font-bold">place_id</dt><dd className="break-all font-mono text-xs">{selectedPlace.placeId}</dd>
            </dl>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#b88b62]/30 bg-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b88b62]/20 p-3">
            <div className="flex gap-2" aria-label="Chọn loại bản đồ">
              {(["roadmap", "satellite", "hybrid"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => changeMapType(type)}
                  className={`rounded-lg px-3 py-2 text-xs font-black capitalize transition ${mapType === type ? "bg-[#744722] text-white" : "border border-[#b88b62]/35 bg-[#fff8ee] text-[#5a391f] hover:bg-[#f3e1c9]"}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <span className="text-xs font-semibold text-[#74583f]">Đang xem: {mapType}</span>
          </div>
          <div ref={mapContainerRef} className="h-[62dvh] min-h-[420px] w-full bg-[#ded6ca] sm:h-[68dvh]" aria-label="Bản đồ Google Maps test" />
        </section>

        <p role="status" className="rounded-xl bg-[#402818] px-4 py-3 text-sm font-semibold text-white">{status}</p>
      </div>
    </main>
  );
}
