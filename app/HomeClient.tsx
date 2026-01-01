"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterBar, { SortMode } from "@/components/FilterBar";
import RoomList from "@/components/RoomList";
import Pagination from "@/components/Pagination";
import { fetchRooms } from "@/lib/fetchRooms";
import { supabase } from "@/lib/supabase";

type InitialProps = {
  initialRooms: any[];
  initialNextCursor: string | { id: string } | null;
  initialAdminLevel: 0 | 1 | 2;
  initialDistricts: string[];
  initialRoomTypes: string[];
};

const LIMIT = 20;

const HomeClient = ({
  initialRooms,
  initialNextCursor,
  initialAdminLevel,
  initialDistricts,
  initialRoomTypes,
}: InitialProps) => {
  // ================== ROLE ==================
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);

  // ================== FILTER STATE (UX cũ) ==================
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [priceDraft, setPriceDraft] = useState<[number, number]>([3_000_000, 30_000_000]);
  const [priceApplied, setPriceApplied] = useState<[number, number]>([3_000_000, 30_000_000]);

  const districts = useMemo(() => initialDistricts ?? [], [initialDistricts]);
  const roomTypes = useMemo(() => initialRoomTypes ?? [], [initialRoomTypes]);

  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);

  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");

  // debounce search (tránh spam request khi gõ)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => {
    const s = debouncedSearch.trim();
    return s.length >= 2 ? s : "";
  }, [debouncedSearch]);

  // ================== PAGINATION CACHE ==================
  const hasSSRInitialRef = useRef(Boolean(initialRooms?.length));

  const initCursor =
    typeof initialNextCursor === "string"
      ? initialNextCursor
      : initialNextCursor?.id ?? null;

  const [pages, setPages] = useState<any[][]>(() => (initialRooms?.length ? [initialRooms] : []));
  const pagesRef = useRef<any[][]>(initialRooms?.length ? [initialRooms] : []);
  const [pageIndex, setPageIndex] = useState(0);

  const cursorsRef = useRef<(string | null)[]>(initialRooms?.length ? [null, initCursor] : [null]);

  const [hasNext, setHasNext] = useState<boolean>(initialRooms?.length ? Boolean(initCursor) : true);

  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");

  const requestIdRef = useRef(0);
  const lastQueryKeyRef = useRef<string>("");

  const skipFirstFilterEffectRef = useRef(true);

  const roomsToRender = useMemo(() => pages[pageIndex] ?? [], [pages, pageIndex]);

  const resetPagination = useCallback(() => {
    pagesRef.current = [];
    setPages([]);
    setPageIndex(0);

    cursorsRef.current = [null];
    setHasNext(true);
  }, []);

  // ================== FETCH PAGE ==================
  const fetchPage = useCallback( async (targetIndex: number) => {
      
      if (pagesRef.current[targetIndex]?.length) return;
       // ✅ chống double-call (StrictMode / filter nhảy)

     const queryKey = JSON.stringify({
      targetIndex,
      cursor: cursorsRef.current[targetIndex] ?? null,
      adminLevel,
      debouncedSearch,
      priceApplied,
      selectedDistricts,
      selectedRoomTypes,
      moveFilter,
      sortMode,
    });

    if (lastQueryKeyRef.current === queryKey) return;
    lastQueryKeyRef.current = queryKey;

      const myReqId = ++requestIdRef.current;
      setLoading(true);
      setFetchError("");
      setShowSkeleton(true);

      try {
        const cursorForThisPage = cursorsRef.current[targetIndex] ?? null;

        const res = await fetchRooms({
          limit: LIMIT,
          cursor: cursorForThisPage,
          adminLevel,
          search: effectiveSearch || undefined,
          minPrice: priceApplied[0],
          maxPrice: priceApplied[1],
          sortMode,
          districts: selectedDistricts.length ? selectedDistricts : undefined,
          roomTypes: selectedRoomTypes.length ? selectedRoomTypes : undefined,
          move: moveFilter ?? undefined,
        });

        if (myReqId !== requestIdRef.current) return;

        const nextPages = [...pagesRef.current];
        nextPages[targetIndex] = res.data;

        pagesRef.current = nextPages;
        setPages(nextPages);

        // set cursor for next page
        cursorsRef.current[targetIndex + 1] = res.nextCursor;

        setHasNext(Boolean(res.nextCursor) && res.data.length === LIMIT);
      } catch (e: any) {
        if (myReqId === requestIdRef.current) {
          console.error(e);
          setFetchError(e?.message ?? "Fetch failed");
        }
      } finally {
        if (myReqId === requestIdRef.current) {
          setLoading(false);
          setShowSkeleton(false);
        }
      }
    },
    [
      adminLevel,
      effectiveSearch,
      priceApplied,
      sortMode,
      selectedDistricts,
      selectedRoomTypes,
      moveFilter,
    ]
  );

  // ================== INITIAL LOAD (no SSR) ==================
  useEffect(() => {
    if (!hasSSRInitialRef.current) fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================== FILTER CHANGE => reset + fetch page 0 ==================
  useEffect(() => {
    if (skipFirstFilterEffectRef.current) {
      skipFirstFilterEffectRef.current = false;
      return;
    }
    resetPagination();
    fetchPage(0);
  }, [effectiveSearch, priceApplied, selectedDistricts, selectedRoomTypes, moveFilter, sortMode, resetPagination, fetchPage]);

  // ================== NEXT / PREV ==================
  const goNext = useCallback(async () => {
  console.log("GO NEXT click", { pageIndex, hasNext, loading });

  if (loading) return;
  if (!hasNext) return;

  const nextIndex = pageIndex + 1;
  console.log("→ nextIndex =", nextIndex);

  // cache hit -> chuyển trang ngay
  if (pagesRef.current[nextIndex]?.length) {
    setPageIndex(nextIndex);
    return;
  }

  // cache miss -> fetch trước, rồi mới chuyển trang
  await fetchPage(nextIndex);
  setPageIndex(nextIndex);
}, [fetchPage, hasNext, loading, pageIndex]);

useEffect(() => {
  const list = pages[pageIndex] ?? [];
  console.log(
    "pageIndex changed →",
    pageIndex,
    "| len =",
    list.length,
    "| firstId =",
    list[0]?.id,
    "| lastId =",
    list[list.length - 1]?.id
  );
}, [pageIndex, pages]);


  const goPrev = useCallback(() => {
    console.log("GO PREV click", { pageIndex, loading });
    if (loading) return;
    setPageIndex((i) => Math.max(0, i - 1));
  }, [loading]);

  // ================== AUTH CHANGE (optional) ==================
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) setAdminLevel(0);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setAdminLevel(0);
      resetPagination();
      fetchPage(0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchPage, resetPagination]);

  return (
    <div>
      <FilterBar
        districts={districts}
        roomTypes={roomTypes}
        loading={loading}
        search={search}
        setSearch={setSearch}
        priceDraft={priceDraft}
        setPriceDraft={setPriceDraft}
        setPriceApplied={setPriceApplied}
        selectedDistricts={selectedDistricts}
        setSelectedDistricts={setSelectedDistricts}
        selectedRoomTypes={selectedRoomTypes}
        setSelectedRoomTypes={setSelectedRoomTypes}
        moveFilter={moveFilter}
        setMoveFilter={setMoveFilter}
        sortMode={sortMode}
        setSortMode={setSortMode}
        onResetAll={() => {
          setSelectedDistricts([]);
          setSelectedRoomTypes([]);
          setMoveFilter(null);
          setSortMode("updated_desc");
          setSearch("");
        }}
      />

          {roomsToRender.length > 0 || loading ? (
        <RoomList
          fetchError={fetchError}
          showSkeleton={showSkeleton}
          roomsToRender={roomsToRender}
          adminLevel={adminLevel}
          pageIndex={pageIndex}
          loading={loading}
          hasNext={hasNext}
          goPrev={goPrev}
          goNext={goNext}
        />
      ) : (
        <div className="container mx-auto px-4 pb-10">Không có dữ liệu.</div>
      )}

      <Pagination goNext={goNext} goPrev={goPrev} hasNext={hasNext} loading={loading} />
    </div>
  );
};

export default HomeClient;
