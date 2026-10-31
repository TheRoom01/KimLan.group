"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import LocationPicker from "@/components/map/LocationPicker";

type Location = { latitude: number; longitude: number };
type Place = Location & { id: string; label: string };

export default function RoomLocationTab({
  value,
  onChange,
  addressQuery,
  loading,
  error,
  disabled,
  autoSuggest = false,
  fallbackQueries = [],
}: {
  value: Location | null;
  onChange: (value: Location | null) => void;
  addressQuery: string;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  autoSuggest?: boolean;
  fallbackQueries?: string[];
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const attempted = useRef("");
  const autoController = useRef<AbortController | null>(null);
  const fallbackKey = fallbackQueries.join("\n");
  const [searchQuery, setSearchQuery] = useState(addressQuery);
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setSearchQuery(addressQuery);
    setPlaces([]);
    setSearchError(null);
  }, [addressQuery]);

  useEffect(() => {
    if (!autoSuggest || disabled || value || addressQuery.length < 3 || attempted.current === addressQuery) return;
    attempted.current = addressQuery;
    const controller = new AbortController();
    autoController.current = controller;
    let completed = false;
    setSearching(true);
    void (async () => {
      try {
        for (const query of [addressQuery, ...fallbackKey.split("\n").filter(Boolean)]) {
          const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal });
          const body = await response.json() as { results?: Place[]; error?: string };
          if (!response.ok) throw new Error(body.error || "Không thể tìm vị trí lúc này.");
          if (controller.signal.aborted) return;
          if (body.results?.length) {
            completed = true;
            setSearchQuery(query); setPlaces(body.results);
            const first = body.results[0];
            onChangeRef.current({ latitude: first.latitude, longitude: first.longitude });
            return;
          }
        }
        completed = true;
        setSearchError("Không tìm thấy vị trí. Bạn có thể tìm lại hoặc đặt ghim trên bản đồ.");
      } catch (error) { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "Không thể tìm vị trí."); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    })();
    return () => { controller.abort(); if (!completed) attempted.current = ""; setSearching(false); };
  }, [autoSuggest, disabled, value, addressQuery, fallbackKey]);

  async function searchAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchError("Nhập ít nhất 3 ký tự để tìm vị trí.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      let nextPlaces: Place[] = [];
      for (const search of [query, ...(query === addressQuery ? fallbackQueries : [])]) {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(search)}`);
        const body = await response.json() as { results?: Place[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Không thể tìm địa chỉ lúc này.");
        nextPlaces = body.results ?? [];
        if (nextPlaces.length) { setSearchQuery(search); break; }
      }
      setPlaces(nextPlaces);
      if (nextPlaces.length === 0) setSearchError("Không tìm thấy vị trí phù hợp.");
    } catch (searchFailure) {
      setPlaces([]);
      setSearchError(searchFailure instanceof Error ? searchFailure.message : "Không thể tìm địa chỉ lúc này.");
    } finally {
      setSearching(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] p-4 text-sm text-[#80634a]">
        Hãy lưu phòng vào một tòa nhà trước khi chọn vị trí.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#aa825d]/25 bg-[#fff9ef] p-4 text-sm font-semibold text-[#684324]">
        Đang tải vị trí tòa nhà…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 md:grid-cols-2">
        <div className="min-h-full rounded-xl border border-[#aa825d]/25 bg-[#f8ecd9] px-3 py-2.5 text-xs leading-5 text-[#684324]">
          <strong className="block text-sm">{autoSuggest ? "Chọn trước vị trí cho bản nháp" : "Vị trí dùng chung của tòa nhà"}</strong>
          <span>{addressQuery || "Chưa có địa chỉ để định vị"}</span>
          {autoSuggest && <p>Vị trí gợi ý là gần đúng. Kiểm tra hoặc kéo ghim; vị trí sẽ được gán cho tòa nhà khi duyệt.</p>}
          
        </div>

        <div className="relative min-h-full rounded-xl border border-[#aa825d]/25 bg-white p-2.5">
          <form onSubmit={searchAddress} className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#80634a]" />
              <span className="sr-only">Tìm vị trí tòa nhà</span>
              <input
                value={searchQuery}
                onChange={(event) => {
                  autoController.current?.abort();
                  setSearching(false);
                  setSearchQuery(event.target.value);
                  setPlaces([]);
                  setSearchError(null);
                }}
                placeholder="Số nhà, đường, phường, quận…"
                className="h-10 w-full rounded-lg border border-[#aa825d]/30 bg-[#fffaf2] pl-9 pr-3 text-sm text-[#4d3422] outline-none focus:border-[#744722] focus:ring-2 focus:ring-[#744722]/15"
              />
            </label>
            <button type="submit" disabled={searching} className="inline-flex h-10 min-w-16 items-center justify-center rounded-lg bg-[#744722] px-3 text-sm font-bold text-white disabled:opacity-60">
              {searching ? <Loader2 size={16} className="animate-spin" /> : "Tìm"}
            </button>
          </form>

          {searchError ? <p className="mt-2 text-xs text-red-700">{searchError}</p> : null}
          {places.length > 0 ? (
            <div className="absolute inset-x-2.5 top-[52px] z-20 max-h-52 overflow-y-auto rounded-xl border border-[#aa825d]/25 bg-white shadow-xl">
              {places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery(place.label);
                    setPlaces([]);
                    setSearchError(null);
                    onChange({ latitude: place.latitude, longitude: place.longitude });
                  }}
                  className="block w-full border-b border-[#aa825d]/15 px-3 py-2.5 text-left text-xs leading-5 text-[#4d3422] last:border-b-0 hover:bg-[#f3e1c9]"
                >
                  {place.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <LocationPicker
        value={value}
        onChange={onChange}
        addressQuery={addressQuery}
        heightClassName="h-[380px] sm:h-[460px]"
        showAddressSuggestion={false}
      />
    </div>
  );
}
