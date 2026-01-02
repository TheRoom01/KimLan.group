"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterBar, { SortMode } from "@/components/FilterBar";
import RoomList from "@/components/RoomList";
import Pagination from "@/components/Pagination";
import { fetchRooms, type UpdatedDescCursor } from "@/lib/fetchRooms";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";

type InitialProps = {
  initialRooms: any[];
  initialNextCursor: string | UpdatedDescCursor | null;
  initialAdminLevel: 0 | 1 | 2;
  initialDistricts: string[];
  initialRoomTypes: string[];
};

const LIMIT = 20;

const QS = {
  q: "q",
  min: "min",
  max: "max",
  d: "d",
  t: "t",
  m: "m",
  s: "s",
  p: "p",
} as const;

function parseList(v: string | null) {
  if (!v) return [];
  return v
    .split(",")
    .map((x) => decodeURIComponent(x))
    .filter(Boolean);
}
function toListParam(arr: string[]) {
  return arr.map((x) => encodeURIComponent(x)).join(",");
}

const PRICE_DEFAULT: [number, number] = [3_000_000, 30_000_000];

const HOME_STATE_KEY = "HOME_STATE_V2"; // bump key để tránh conflict state cũ
type PersistState = {
  // url signature để chỉ restore khi đúng state
  qs: string;

  // filters
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;

  // pagination cache
  pageIndex: number;
  displayPageIndex: number;
  pages: any[][];
  cursors: (string | UpdatedDescCursor | null)[];
  hasNext: boolean;

  // scroll
  scrollTop: number;

  // ttl
  ts: number;
};

const HomeClient = ({
  initialRooms,
  initialNextCursor,
  initialAdminLevel,
  initialDistricts,
  initialRoomTypes,
}: InitialProps) => {
  const pathname = usePathname();

  // ================== ROLE ==================
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);

  // ================== FILTER ==================
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [priceDraft, setPriceDraft] = useState<[number, number]>(PRICE_DEFAULT);
  const [priceApplied, setPriceApplied] = useState<[number, number]>(PRICE_DEFAULT);

  const [minPriceApplied, maxPriceApplied] = useMemo(() => {
    const a = priceApplied[0];
    const b = priceApplied[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceApplied]);

  const districts = useMemo(() => initialDistricts ?? [], [initialDistricts]);
  const roomTypes = useMemo(() => initialRoomTypes ?? [], [initialRoomTypes]);
  const filterApplyTimerRef = useRef<number | null>(null);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");

  // ================== DEBOUNCE SEARCH ==================
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => {
    const s = debouncedSearch.trim();
    return s.length >= 2 ? s : "";
  }, [debouncedSearch]);

  // ================== PAGINATION (cache) ==================
  const initCursor: string | UpdatedDescCursor | null =
    initialNextCursor && typeof initialNextCursor === "object"
      ? { id: initialNextCursor.id, updated_at: initialNextCursor.updated_at }
      : typeof initialNextCursor === "string"
        ? initialNextCursor
        : null;

  // ✅ IMPORTANT: phân biệt "chưa fetch" (undefined) vs "đã fetch nhưng rỗng" ([])
  const [pages, setPages] = useState<any[][]>(() =>
    initialRooms?.length ? [initialRooms] : []
  );
  const pagesRef = useRef<any[][]>(initialRooms?.length ? [initialRooms] : []);

  const [pageIndex, setPageIndex] = useState(0);
  const [displayPageIndex, setDisplayPageIndex] = useState(0);

  const cursorsRef = useRef<(string | UpdatedDescCursor | null)[]>(
    initialRooms?.length ? [null, initCursor] : [null]
  );

  const [hasNext, setHasNext] = useState<boolean>(
    initialRooms?.length ? Boolean(initCursor) : true
  );

  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");
  
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<Record<number, boolean>>({});

  // ================== GUARDS ==================
  const hydratingFromUrlRef = useRef(false);
  const filtersVersionRef = useRef(0); // "đợt filter" để drop response cũ

const pageIndexRef = useRef(0);
useEffect(() => {
pageIndexRef.current = pageIndex;
}, [pageIndex]);

  
  // ✅ skip FILTER CHANGE mỗi khi ta "hydrate state" (initial / popstate / restore)
const skipNextFilterEffectRef = useRef(true);


  // scroll container
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ================== ROOMS TO RENDER ==================
  const roomsToRender = useMemo(
    () => pages[displayPageIndex] ?? [],
    [pages, displayPageIndex]
  );

  // ================== URL helpers (SHALLOW, NO NEXT NAV) ==================
  const buildQs = useCallback(
    (next: {
      q?: string;
      min?: number;
      max?: number;
      d?: string[];
      t?: string[];
      m?: "elevator" | "stairs" | null;
      s?: SortMode;
      p?: number;
    }) => {
      const params = new URLSearchParams(window.location.search);

      const setOrDel = (key: string, val: string | null) => {
        if (val == null || val === "") params.delete(key);
        else params.set(key, val);
      };

      setOrDel(QS.q, next.q?.trim() ? next.q.trim() : null);
      setOrDel(QS.min, typeof next.min === "number" ? String(next.min) : null);
      setOrDel(QS.max, typeof next.max === "number" ? String(next.max) : null);
      setOrDel(QS.d, next.d?.length ? toListParam(next.d) : null);
      setOrDel(QS.t, next.t?.length ? toListParam(next.t) : null);
      setOrDel(QS.m, next.m ? next.m : null);
      setOrDel(QS.s, next.s ? next.s : null);

      // p=0 thì bỏ để URL sạch
      setOrDel(QS.p, typeof next.p === "number" && next.p > 0 ? String(next.p) : null);

      return params.toString();
    },
    []
  );

  const replaceUrlShallow = useCallback(
    (nextQs: string) => {
      // 🚫 không dùng router.replace => không trigger Next navigation => không nháy
      const currentQs = window.location.search.replace(/^\?/, "");
      if (nextQs === currentQs) return;

      const url = nextQs ? `${pathname}?${nextQs}` : pathname;
      window.history.replaceState(window.history.state, "", url);
    },
    [pathname]
  );

  const readUrlState = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);

    const q = sp.get(QS.q) ?? "";
    const min = Number(sp.get(QS.min) ?? "");
    const max = Number(sp.get(QS.max) ?? "");
    const d = parseList(sp.get(QS.d));
    const t = parseList(sp.get(QS.t));
    const m = (sp.get(QS.m) as "elevator" | "stairs" | null) || null;
    const s = (sp.get(QS.s) as SortMode) || "updated_desc";
    const p = Number(sp.get(QS.p) ?? "0");

    const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
    const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];
    const nextPage = Number.isFinite(p) && p >= 0 ? p : 0;
    
    const qs = sp.toString();

    return { qs, q, minVal, maxVal, d, t, m, s, nextPage };
  }, []);

  // ================== PERSIST (sessionStorage) ==================
  const persistRafRef = useRef<number | null>(null);

  const persistNow = useCallback(() => {
    try {
      const el = scrollRef.current;
      const payload: PersistState = {
        qs: window.location.search.replace(/^\?/, ""),

        search,
        priceApplied,
        selectedDistricts,
        selectedRoomTypes,
        moveFilter,
        sortMode,

        pageIndex,
        displayPageIndex,
        pages: pagesRef.current,
        cursors: cursorsRef.current,
        hasNext,

        scrollTop: el?.scrollTop ?? 0,

        ts: Date.now(),
      };

      sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    pageIndex,
    displayPageIndex,
    hasNext,
  ]);

  const persistSoon = useCallback(() => {
    if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
    persistRafRef.current = requestAnimationFrame(() => {
      persistRafRef.current = null;
      persistNow();
    });
  }, [persistNow]);

  // save on unmount
  useEffect(() => {
    return () => {
      if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
      persistNow();
    };
  }, [persistNow]);

  // ================== RESET PAGINATION ==================
  const resetPagination = useCallback((keepPage: number = 0) => {
  // ✅ chỉ reset UI/cache, KHÔNG “kill request” bằng requestId
  inFlightRef.current = {};

  pagesRef.current = [];
  setPages([]);

  setPageIndex(keepPage);
  setDisplayPageIndex(keepPage);

  cursorsRef.current = [null];
  setHasNext(true);

  setFetchError("");
  setLoading(false);
  setShowSkeleton(true);
}, []);


  // helper: end hydration after 2 frames (đảm bảo FILTER CHANGE effect không chạy nhầm)
  const endHydrationAfterTwoFrames = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hydratingFromUrlRef.current = false;
      });
    });
  }, []);

  // ================== HYDRATE from sessionStorage + URL (ONCE) ==================
  
  useEffect(() => {
    
    // Detect reload (F5 / pull-to-refresh)
    const navType =
      (
        performance.getEntriesByType("navigation")?.[0] as
          | PerformanceNavigationTiming
          | undefined
      )?.type ?? "navigate";
    const isReload = navType === "reload";
skipNextFilterEffectRef.current = true;

    // 1) read URL
    const url = readUrlState();

    // 2) try restore from sessionStorage (match qs)
    let restored: PersistState | null = null;
    try {
      const raw = sessionStorage.getItem(HOME_STATE_KEY);
      if (raw) restored = JSON.parse(raw) as PersistState;
    } catch {
      restored = null;
    }

    // TTL optional: 30 phút
    const ttlOk = restored?.ts ? Date.now() - restored.ts < 30 * 60 * 1000 : false;

    if (restored && ttlOk && restored.qs === url.qs) {
      hydratingFromUrlRef.current = true;

      // ✅ LUÔN restore FILTER
      const restoredSearch = restored.search ?? "";
      const restoredPrice = restored.priceApplied ?? PRICE_DEFAULT;
      const restoredDistricts = restored.selectedDistricts ?? [];
      const restoredTypes = restored.selectedRoomTypes ?? [];
      const restoredMove = restored.moveFilter ?? null;
      const restoredSort = restored.sortMode ?? "updated_desc";

      setSearch(restoredSearch);
      setPriceDraft(restoredPrice);
      setPriceApplied(restoredPrice);
      setSelectedDistricts(restoredDistricts);
      setSelectedRoomTypes(restoredTypes);
      setMoveFilter(restoredMove);
      setSortMode(restoredSort);

      // ✅ Nếu reload: reset page + scroll, KHÔNG restore cache/pages/cursors/scroll
      if (isReload) {
  // ✅ Reload: reset vị trí + trang về 0, GIỮ filter, KHÔNG clear pages để tránh nháy trắng
  hydratingFromUrlRef.current = true;
  skipNextFilterEffectRef.current = true;

  // ép về trang 0
  setPageIndex(0);
  setDisplayPageIndex(0);

  // nếu SSR có initialRooms thì đảm bảo cache page0 có data ngay
  if (initialRooms?.length) {
    pagesRef.current = [initialRooms];
    setPages([initialRooms]);

    cursorsRef.current = [null, initCursor];
    setHasNext(Boolean(initCursor));
    setShowSkeleton(false);
    setLoading(false);
  } else {
    // nếu không có SSR data, để cơ chế fetch tự chạy
    filtersVersionRef.current += 1;
    resetPagination(0);
  }

  const qsNoPage = buildQs({
    q: restoredSearch.trim(),
    min: restoredPrice[0],
    max: restoredPrice[1],
    d: restoredDistricts,
    t: restoredTypes,
    m: restoredMove,
    s: restoredSort,
    p: 0,
  });
  replaceUrlShallow(qsNoPage);

  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  });

  endHydrationAfterTwoFrames();
  return;
}


      // (Giữ behavior cũ khi KHÔNG reload)
      pagesRef.current = restored.pages ?? [];
      setPages(restored.pages ?? []);
      cursorsRef.current = restored.cursors ?? [null];
      setHasNext(Boolean(restored.hasNext));

      setPageIndex(restored.pageIndex ?? 0);
      setDisplayPageIndex(restored.displayPageIndex ?? restored.pageIndex ?? 0);

      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el && typeof restored!.scrollTop === "number") {
          el.scrollTop = restored!.scrollTop;
        }
      });

      endHydrationAfterTwoFrames();
      return;
    }

    // 3) nếu không restore được, hydrate từ URL (filter + page)
    const hasAny =
      url.qs.length > 0 &&
      (new URLSearchParams(window.location.search).has(QS.q) ||
        new URLSearchParams(window.location.search).has(QS.min) ||
        new URLSearchParams(window.location.search).has(QS.max) ||
        new URLSearchParams(window.location.search).has(QS.d) ||
        new URLSearchParams(window.location.search).has(QS.t) ||
        new URLSearchParams(window.location.search).has(QS.m) ||
        new URLSearchParams(window.location.search).has(QS.s) ||
        new URLSearchParams(window.location.search).has(QS.p));

    if (!hasAny) {
  // ✅ coi như hydrate xong nhưng không set filter từ URL => vẫn skip 1 nhịp filter effect
  skipNextFilterEffectRef.current = true;
  return;
}

    hydratingFromUrlRef.current = true;

    setSearch(url.q);
    setPriceDraft([url.minVal, url.maxVal]);
    setPriceApplied([url.minVal, url.maxVal]);
    setSelectedDistricts(url.d);
    setSelectedRoomTypes(url.t);
    setMoveFilter(url.m);
    setSortMode(url.s);

    // ✅ reload thì ép page về 0 + bỏ p khỏi URL + scrollTop=0
    const pageFromUrl = isReload ? 0 : url.nextPage;

    filtersVersionRef.current += 1;
    
    if (isReload) {
  // ✅ Reload: về page 0 + giữ SSR page0 nếu có
  setPageIndex(0);
  setDisplayPageIndex(0);

  if (initialRooms?.length) {
    pagesRef.current = [initialRooms];
    setPages([initialRooms]);

    cursorsRef.current = [null, initCursor];
    setHasNext(Boolean(initCursor));
    setShowSkeleton(false);
    setLoading(false);
  } else {
    resetPagination(0);
  }
} else {
  resetPagination(pageFromUrl);
}

    endHydrationAfterTwoFrames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const onPop = () => {
    // ✅ back/forward: coi như 1 lần hydrate => skip filter effect 1 nhịp
    skipNextFilterEffectRef.current = true;

    const url = readUrlState();

    // ưu tiên restore state để giữ page + scroll
    let restored: PersistState | null = null;
    try {
      const raw = sessionStorage.getItem(HOME_STATE_KEY);
      if (raw) restored = JSON.parse(raw) as PersistState;
    } catch {
      restored = null;
    }

    const ttlOk = restored?.ts ? Date.now() - restored.ts < 30 * 60 * 1000 : false;

    if (restored && ttlOk && restored.qs === url.qs) {
      hydratingFromUrlRef.current = true;

      // restore filters
      setSearch(restored.search ?? "");
      setPriceDraft(restored.priceApplied ?? PRICE_DEFAULT);
      setPriceApplied(restored.priceApplied ?? PRICE_DEFAULT);
      setSelectedDistricts(restored.selectedDistricts ?? []);
      setSelectedRoomTypes(restored.selectedRoomTypes ?? []);
      setMoveFilter(restored.moveFilter ?? null);
      setSortMode(restored.sortMode ?? "updated_desc");

      // restore cache + pagination
      pagesRef.current = restored.pages ?? [];
      setPages(restored.pages ?? []);
      cursorsRef.current = restored.cursors ?? [null];
      setHasNext(Boolean(restored.hasNext));

      setPageIndex(restored.pageIndex ?? 0);
      setDisplayPageIndex(restored.displayPageIndex ?? restored.pageIndex ?? 0);

      // restore scroll after paint
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el && typeof restored!.scrollTop === "number") el.scrollTop = restored!.scrollTop;
      });

      endHydrationAfterTwoFrames();
      return;
    }

    // fallback: không restore được thì hydrate theo URL
    hydratingFromUrlRef.current = true;

    setSearch(url.q);
    setPriceDraft([url.minVal, url.maxVal]);
    setPriceApplied([url.minVal, url.maxVal]);
    setSelectedDistricts(url.d);
    setSelectedRoomTypes(url.t);
    setMoveFilter(url.m);
    setSortMode(url.s);
    
    filtersVersionRef.current += 1;
    resetPagination(url.nextPage);
    fetchPage(url.nextPage);
    endHydrationAfterTwoFrames();
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [readUrlState, resetPagination, endHydrationAfterTwoFrames]);



  // ================== FETCH PAGE ==================
  const fetchPage = useCallback(
  async (targetIndex: number) => {
    // ✅ snapshot version tại thời điểm bắt đầu request
    const myVersion = filtersVersionRef.current;

    // ✅ nếu page đã fetch (kể cả rỗng []) thì không fetch lại
    if (pagesRef.current[targetIndex] !== undefined) {
      setShowSkeleton(false);
      return;
    }

    // chặn gọi trùng khi đang bay
    if (inFlightRef.current[targetIndex]) return;
    inFlightRef.current[targetIndex] = true;

    setLoading(true);
    setShowSkeleton(true);
    setFetchError("");

    try {
      const cursorForThisPage = cursorsRef.current[targetIndex] ?? null;

      const res = await fetchRooms({
        limit: LIMIT,
        cursor: cursorForThisPage,
        adminLevel,
        search: effectiveSearch || undefined,
        minPrice: minPriceApplied,
        maxPrice: maxPriceApplied,
        sortMode,
        districts: selectedDistricts.length ? selectedDistricts : undefined,
        roomTypes: selectedRoomTypes.length ? selectedRoomTypes : undefined,
        move: moveFilter ?? undefined,
      });

      // ✅ drop nếu version đã đổi sau khi request bắt đầu
      if (myVersion !== filtersVersionRef.current) return;

      // dedup theo id
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const r of res.data ?? []) {
        const id = String(r?.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        deduped.push(r);
      }

      const nextPages = [...pagesRef.current];
      nextPages[targetIndex] = deduped; // có thể là []

      pagesRef.current = nextPages;
      setPages(nextPages);

      cursorsRef.current[targetIndex + 1] = res.nextCursor ?? null;
      setHasNext(Boolean(res.nextCursor) && deduped.length === LIMIT);

      // ✅ show ngay page đang đứng
      if (targetIndex === pageIndexRef.current) {
        setDisplayPageIndex(targetIndex);
      }
    } catch (e: any) {
      if (myVersion === filtersVersionRef.current) {
        setFetchError(e?.message ?? "Fetch failed");
      }
    } finally {
      inFlightRef.current[targetIndex] = false;

      // ✅ tắt skeleton nếu page đã có trạng thái (kể cả [])
      const fetched = pagesRef.current[targetIndex] !== undefined;
      if (fetched) {
        setLoading(false);
        setShowSkeleton(false);
      }
    }
  },
  [
    adminLevel,
    effectiveSearch,
    minPriceApplied,
    maxPriceApplied,
    sortMode,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
  ]
);



  // ================== CENTRAL FETCH ==================
  useEffect(() => {
  const cached = pagesRef.current[pageIndex];

  // ✅ chỉ fetch khi CHƯA từng fetch (undefined)
  if (cached === undefined) {
    fetchPage(pageIndex);
  } else {
    setShowSkeleton(false);
    setDisplayPageIndex(pageIndex);
  }
}, [pageIndex, fetchPage]);


  // ================== SCROLL PERSIST (không gây fetch) ==================
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        persistSoon();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [persistSoon]);

  // ================== FILTER CHANGE ==================
const lastFilterSigRef = useRef<string>("");

useEffect(() => {
  // ✅ nếu vừa hydrate (initial/popstate/restore) thì bỏ qua 1 nhịp FILTER CHANGE
  if (skipNextFilterEffectRef.current) {
    skipNextFilterEffectRef.current = false;

    // cập nhật signature hiện tại để không reset ngay nhịp sau
    const sigNow = [
      search.trim(),
      String(priceApplied[0]),
      String(priceApplied[1]),
      [...selectedDistricts].sort().join("|"),
      [...selectedRoomTypes].sort().join("|"),
      moveFilter ?? "",
      sortMode ?? "",
    ].join("~");
    lastFilterSigRef.current = sigNow;

    return;
  }

  if (hydratingFromUrlRef.current) return;

  // ✅ normalize filter -> signature primitive để tránh array reference gây reset giả
  const sig = [
    search.trim(),
    String(priceApplied[0]),
    String(priceApplied[1]),
    [...selectedDistricts].sort().join("|"),
    [...selectedRoomTypes].sort().join("|"),
    moveFilter ?? "",
    sortMode ?? "",
  ].join("~");

  // ✅ nếu không đổi thật thì không làm gì (tránh trắng)
  if (sig === lastFilterSigRef.current) return;
  lastFilterSigRef.current = sig;

  // bump version + reset cache (page về 0)
  filtersVersionRef.current += 1;

  const qs = buildQs({
    q: search.trim(),
    min: priceApplied[0],
    max: priceApplied[1],
    d: selectedDistricts,
    t: selectedRoomTypes,
    m: moveFilter,
    s: sortMode,
    p: 0,
  });
  
// ... sau khi đã tính sig và lastFilterSigRef
if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);

filterApplyTimerRef.current = window.setTimeout(() => {
  replaceUrlShallow(qs);
  resetPagination(0);
  fetchPage(0);
  persistSoon();
}, 200);

return () => {
  if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);
};

  }, [
  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  buildQs,
  replaceUrlShallow,
  resetPagination,
  persistSoon,
  fetchPage,
]);


  // ================== NEXT / PREV ==================
  const goNext = useCallback(() => {
    if (loading || !hasNext) return;

    const next = pageIndex + 1;
    setPageIndex(next);

    const qs = buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      p: next,
    });
    replaceUrlShallow(qs);

    persistSoon();
  }, [
    loading,
    hasNext,
    pageIndex,
    buildQs,
    replaceUrlShallow,
    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    persistSoon,
  ]);

  const goPrev = useCallback(() => {
    if (loading) return;

    const next = Math.max(0, pageIndex - 1);
    setPageIndex(next);

    const qs = buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      p: next,
    });
    replaceUrlShallow(qs);

    persistSoon();
  }, [
    loading,
    pageIndex,
    buildQs,
    replaceUrlShallow,
    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    persistSoon,
  ]);

 // ================== AUTH CHANGE (KHÔNG refresh tự động) ==================
const skipFirstAuthEffectRef = useRef(true);
const lastSessionUserIdRef = useRef<string | null>(null);

useEffect(() => {
  let mounted = true;

  // 1) Lấy session ban đầu để có baseline user id
  supabase.auth.getSession().then(({ data }) => {
    if (!mounted) return;

    const uid = data.session?.user?.id ?? null;
    lastSessionUserIdRef.current = uid;

    // nếu không có session thì hạ quyền
    if (!data.session) setAdminLevel(0);
  });

  // 2) Nghe auth events
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!mounted) return;

    // Skip callback đầu tiên (thường là INITIAL_SESSION hoặc bắn ngay khi subscribe)
    if (skipFirstAuthEffectRef.current) {
      skipFirstAuthEffectRef.current = false;
      lastSessionUserIdRef.current = session?.user?.id ?? null;
      return;
    }

    const nextUid = session?.user?.id ?? null;
    const prevUid = lastSessionUserIdRef.current;

    // cập nhật baseline
    lastSessionUserIdRef.current = nextUid;

    // ✅ CHỈ coi là "auth đổi thật" khi user id thay đổi (login/logout/đổi user)
    const userChanged = prevUid !== nextUid;
    if (!userChanged) return;

    // user logout -> hạ quyền
    if (!session) setAdminLevel(0);

    // auth đổi thật -> invalidate list
    filtersVersionRef.current += 1;
    resetPagination(pageIndex);
    fetchPage(pageIndex);
    persistSoon();
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, [resetPagination, pageIndex, persistSoon]);


  // ================== RENDER ==================
  return (
    <div className="flex flex-col h-screen">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24 bg-gray-200">
        <header className="relative z-50 h-[200px] md:h-[300px]">
          <div className="absolute inset-0 overflow-hidden">
            <img
              src="/hero.jpg"
              alt="KL.G"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/10" />
          </div>

          <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 z-[1000] flex flex-col items-start gap-3">
            <h1 className="text-4xl md:text-5xl font-bold text-white">KL.G</h1>

            {/* anchor cho AuthControls portal */}
            <div className="relative z-[1000]">
              <div id="auth-anchor" />
            </div>
          </div>
        </header>

        {/* STICKY FILTER BAR */}
        <div className="sticky top-0 z-[900] bg-gray-200">
          <div className="border-b border-black/10">
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
          </div>
        </div>

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
      </div>

      <div className="shrink-0 border-t bg-white">
        <Pagination goNext={goNext} goPrev={goPrev} hasNext={hasNext} loading={loading} />
      </div>

      {/* portal root nếu bạn đang dùng */}
      <div id="portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
    </div>
  );
};

export default HomeClient;
