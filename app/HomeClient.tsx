"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterBar, { SortMode } from "@/components/FilterBar";
import RoomList from "@/components/RoomList";
import Pagination from "@/components/Pagination";
import { fetchRooms, type UpdatedDescCursor } from "@/lib/fetchRooms";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";
import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";


type InitialProps = {
  initialRooms: any[];
  initialNextCursor: string | UpdatedDescCursor | null;
  initialAdminLevel: 0 | 1 | 2;
  initialTotal?: number | null; // ✅
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
  st: "st",
  p: "p",
} as const;

function parseList(v: string | null) {
  if (!v) return [];
  return v
  .split(",")
  .map((x) => decodeURIComponent(x).trim())
  .filter(Boolean);

}

function toListParam(arr: string[]) {
  // ✅ để URLSearchParams tự encode, đừng encode ở đây
  return arr.join(",");
}


const PRICE_DEFAULT: [number, number] = [3_000_000, 30_000_000];
const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 15 * 60 * 1000; // 15 phút
const HOME_STATE_KEY = "HOME_STATE_V2"; // bump key để tránh conflict state cũ

type PersistState = {
  // url signature để chỉ restore khi đúng state
  qs: string;

 // ✅ total rooms
  total: number | null;

  // filters
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;
  statusFilter: string | null;

   // pagination cache
  pageIndex: number;
  displayPageIndex: number;
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
  initialTotal,
}: InitialProps) => {

  const pathname = usePathname();
  const homePathRef = useRef<string>("");      // pathname của Home lúc mount
  const listQsRef = useRef<string>("");        // qs ổn định của list
  const didRestoreFromStorageRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(
    typeof initialTotal === "number" ? initialTotal : null
  );

    // ================== ROLE ==================
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);
 
  // ================== FILTER ==================
  
    const [priceDraft, setPriceDraft] = useState<[number, number]>(PRICE_DEFAULT);
  const [priceApplied, setPriceApplied] = useState<[number, number]>(PRICE_DEFAULT);

  const [minPriceApplied, maxPriceApplied] = useMemo(() => {
    const a = priceApplied[0];
    const b = priceApplied[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceApplied]);

  const districts = useMemo(() => [...DISTRICT_OPTIONS], []);
  const roomTypes = useMemo(() => [...ROOM_TYPE_OPTIONS], []);

  const filterApplyTimerRef = useRef<number | null>(null);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  
  //-----------------appliedSearch------------
  const [search, setSearch] = useState("");

  function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

// Debounce search input để fetch không bị trễ 1 nhịp + không spam request
const appliedSearch = useDebouncedValue(search, 250);

    
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
  // ✅ luôn sync pageIndex/displayPageIndex mới nhất vào ref
useEffect(() => {
  lastPageIndexRef.current = pageIndex;
}, [pageIndex]);

useEffect(() => {
  lastDisplayPageIndexRef.current = displayPageIndex;
}, [displayPageIndex]);
useEffect(() => {
  pagesRef.current = pages;
}, [pages]);

  
  const cursorsRef = useRef<(string | UpdatedDescCursor | null)[]>(
    initialRooms?.length ? [null, initCursor] : [null]
  );

  const [hasNext, setHasNext] = useState<boolean>(
    initialRooms?.length ? Boolean(initCursor) : true
  );
   const didHydrateOnceRef = useRef(false);
    const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");
  const fetchPageRef = useRef<(targetIndex: number) => void>(() => {});

  const requestIdRef = useRef(0);
  const inFlightRef = useRef<Record<string, boolean>>({});

  // ================== GUARDS ==================
  const hydratingFromUrlRef = useRef(false);
  const filtersVersionRef = useRef(0); // "đợt filter" để drop response cũ

const pageIndexRef = useRef(0);
useEffect(() => {
pageIndexRef.current = pageIndex;
}, [pageIndex]);

// ================== Effect =============
useEffect(() => {
  // chỉ set lần đầu
  if (!homePathRef.current) homePathRef.current = pathname;
  // lưu qs hiện tại của Home ngay lúc mount
  listQsRef.current = window.location.search.replace(/^\?/, "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  
  // ✅ skip FILTER CHANGE mỗi khi ta "hydrate state" (initial / popstate / restore)
const skipNextFilterEffectRef = useRef(true);

  // scroll container
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const pendingScrollTopRef = useRef<number | null>(null);
  const restoringRef = useRef(false);

const lastPageIndexRef = useRef(0);
const lastDisplayPageIndexRef = useRef(0);

// chặn persist khi đang restore/back
const persistBlockedRef = useRef(false);

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
      st?: string | null;
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
      setOrDel(QS.st, next.st ? next.st : null);
      setOrDel(QS.p, typeof next.p === "number" ? String(next.p) : null);
      return params.toString();
    },
    []
  );

  function canonicalQs(qs: string) {
  const sp = new URLSearchParams(qs.replace(/^\?/, ""));
  const entries = Array.from(sp.entries());
  entries.sort(([aK, aV], [bK, bV]) => (aK === bK ? aV.localeCompare(bV) : aK.localeCompare(bK)));
  const out = new URLSearchParams();
  for (const [k, v] of entries) out.append(k, v);
  return out.toString();
}

  const replaceUrlShallow = useCallback(
  (nextQs: string) => {
    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return;

    const url = nextQs ? `${pathname}?${nextQs}` : pathname;
    window.history.replaceState(window.history.state, "", url);

    // ✅ luôn giữ qs ổn định của Home list
    listQsRef.current = nextQs;
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

    const st = sp.get(QS.st) || null;
   
    const qs = canonicalQs(sp.toString());

    return { qs, q, minVal, maxVal, d, t, m, s, st, nextPage };
  }, []);

 // ================== PERSIST (sessionStorage) ==================
const persistRafRef = useRef<number | null>(null);

// ✅ chỉ khai báo 1 lần (đừng để trùng ở file)
const navigatingAwayRef = useRef(false);
const freezeFilterApplyRef = useRef(false);

// ✅ snapshot cố định để tránh persist sau đó ghi đè thành p=0
const snapshotRef = useRef<PersistState | null>(null);

// ✅ mỗi lần mount Home, reset flag
useEffect(() => {
  navigatingAwayRef.current = false;
  snapshotRef.current = null;
}, []);

const buildPersistPayload = useCallback((): PersistState => {
  // ✅ LUÔN build qs từ STATE hiện tại
  const qsNow = buildQs({
    q: search.trim(),
    min: priceApplied[0],
    max: priceApplied[1],
    d: selectedDistricts,
    t: selectedRoomTypes,
    m: moveFilter,
    s: sortMode,
    st: statusFilter,
    p: pageIndexRef.current,
  });

  return {
    qs: qsNow,

    total: typeof total === "number" ? total : null,

    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    statusFilter,

    pageIndex: pageIndexRef.current,
    displayPageIndex,

    cursors: cursorsRef.current,
    hasNext,

    scrollTop: scrollRef.current
      ? scrollRef.current.scrollTop
      : lastScrollTopRef.current,

    ts: Date.now(),
  };
}, [
  buildQs,
  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  statusFilter,
  total,
  displayPageIndex,
  hasNext,
]);

const persistNow = useCallback(
  (force: boolean = false) => {
    // ✅ cho phép force persist ngay cả khi đang hydrate
    if (!force && hydratingFromUrlRef.current) return;

    // bình thường thì chặn persist khi đang hydrate/back
    if (!force && persistBlockedRef.current) return;

    // chỉ persist khi đang ở đúng pathname của Home (trừ khi force)
    if (!force && homePathRef.current && pathname !== homePathRef.current) return;

    try {
      // ✅ Nếu đang rời Home và đã có snapshot -> LUÔN ghi snapshot, không rebuild payload
      if (force && navigatingAwayRef.current && snapshotRef.current) {
        sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(snapshotRef.current));
        return;
      }

      const payload = buildPersistPayload();

      // ✅ nếu force thì đóng băng snapshot NGAY (chỉ khi chưa có snapshot)
      if (force && !snapshotRef.current) snapshotRef.current = payload;

      // ✅ Nếu đang rời Home: luôn ghi đúng snapshot đã đóng băng
      if (navigatingAwayRef.current && snapshotRef.current) {
        sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(snapshotRef.current));
        return;
      }

      sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(payload));
    } catch {}
  },
  [pathname, buildPersistPayload]
);


const persistSoon = useCallback(() => {
  // ✅ đang rời Home thì không schedule persist nữa
  if (navigatingAwayRef.current) return;

  if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
  persistRafRef.current = requestAnimationFrame(() => {
    persistRafRef.current = null;
    persistNow(false);
  });
}, [persistNow]);

// save on unmount
useEffect(() => {
  return () => {
    if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
    // ✅ nếu unmount do navigate-away thì snapshotRef sẽ đảm bảo không bị p=0
    persistNow(true);
  };
}, [persistNow]);

// ✅ Persist chắc chắn khi rời trang (đổi tab, bfcache, đóng tab...)
useEffect(() => {
  const onPageHide = () => {
    persistNow(true);
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      persistNow(true);
    }
  };

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, [persistNow]);

// ================== CLICK ĐI DETAIL ==================
const onPointerDownCapture = useCallback((ev: PointerEvent) => {
  const target = ev.target as HTMLElement | null;
  const a = target?.closest("a");
  if (!a) return;

  const href = a.getAttribute("href");
  if (!href || href.startsWith("#")) return;

  // bỏ qua new-tab / middle click
  if ((ev as any).metaKey || (ev as any).ctrlKey) return;
  if ((ev as any).button != null && (ev as any).button !== 0) return;

  navigatingAwayRef.current = true;

  if (filterApplyTimerRef.current) {
    clearTimeout(filterApplyTimerRef.current);
    filterApplyTimerRef.current = null;
  }

  const snapshot = {
    qs: buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
      p: pageIndexRef.current,
    }),
    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    statusFilter,
    pageIndex: pageIndexRef.current,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
  };

  // 🔥 CỐT LÕI – KHÔNG CÁI NÀY LÀ CHẾT
  window.history.replaceState(
    { ...window.history.state, __home: snapshot },
    ""
  );
}, [
  buildQs,
  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  statusFilter,
]);


// ✅ BẮT BUỘC: gắn listener capture để handler chạy TRƯỚC router
useEffect(() => {
  const handler = (ev: Event) => onPointerDownCapture(ev as PointerEvent);

  document.addEventListener("pointerdown", handler, { capture: true });
  document.addEventListener("mousedown", handler, { capture: true });

  return () => {
    document.removeEventListener("pointerdown", handler, { capture: true } as any);
    document.removeEventListener("mousedown", handler, { capture: true } as any);
  };
}, [onPointerDownCapture]);


  // ================== RESET PAGINATION ==================
  const resetPagination = useCallback((keepPage: number = 0) => {
  // ✅ chỉ reset UI/cache, KHÔNG “kill request” bằng requestId
  inFlightRef.current = {};

  pagesRef.current = [];
  setPages([]);

  pageIndexRef.current = keepPage;
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

  // ================== HYDRATE (ONCE) ==================
useEffect(() => {
  if (didHydrateOnceRef.current) return;
  didHydrateOnceRef.current = true;
  // ✅ chặn FILTER CHANGE effect chạy ngay sau hydrate
  skipNextFilterEffectRef.current = true;
  persistBlockedRef.current = true;
  navigatingAwayRef.current = false;

  // Detect reload (F5 / pull-to-refresh)
  const navType =
    (
      performance.getEntriesByType("navigation")?.[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type ?? "navigate";
 const isReload = navType === "reload";

// giữ qs list ổn định
listQsRef.current = window.location.search.replace(/^\?/, "");

// 1) read URL
const url = readUrlState();

// ✅ BACK từ detail đôi khi bị report nhầm là "reload"
// -> Nếu có HOME_BACK_HINT thì KHÔNG hard reset
let hasBackHint = false;
try {
  hasBackHint = !!sessionStorage.getItem(HOME_BACK_HINT_KEY);
} catch {}

// ✅ HARD RESET chỉ khi reload thật (F5 / pull-to-refresh)
if (isReload && !hasBackHint) {
  hydratingFromUrlRef.current = true;
  try {
    // drop mọi response cũ (nếu có request đang bay)
    filtersVersionRef.current += 1;

    // purge persisted state
    try {
      sessionStorage.removeItem(HOME_STATE_KEY);
    } catch {}
    try {
      sessionStorage.removeItem(HOME_BACK_HINT_KEY);
    } catch {}

    // reset filters -> default
    setSearch("");
    setPriceDraft(PRICE_DEFAULT);
    setPriceApplied(PRICE_DEFAULT);
    setSelectedDistricts([]);
    setSelectedRoomTypes([]);
    setMoveFilter(null);
    setSortMode("updated_desc");
    setStatusFilter(url.st ?? null);

    // reset pagination/cache về page 0
    setPageIndex(0);
    setDisplayPageIndex(0);

    if (initialRooms?.length) {
      pagesRef.current = [initialRooms];
      setPages([initialRooms]);

      cursorsRef.current = [null, initCursor];
      setHasNext(Boolean(initCursor));
      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);
    } else {
      resetPagination(0);
    }

    // clean URL: bỏ toàn bộ query
    replaceUrlShallow("");

    // reset scroll
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });

    finishHydrate();
    return;
  } finally {
    queueMicrotask(() => {
      hydratingFromUrlRef.current = false;
    });
  }
}

  // 2) try restore from sessionStorage (match qs)
  let restored: PersistState | null = null;

  try {
    const raw = sessionStorage.getItem(HOME_STATE_KEY);
    if (raw) restored = JSON.parse(raw) as PersistState;
  } catch {
    restored = null;
  }

 const ttlOk = restored?.ts ? Date.now() - restored.ts < 30 * 60 * 1000 : false;

// ✅ back-from-detail: chỉ cần TTL (KHÔNG phụ thuộc url.qs)
let isBackFromDetail = false;
try {
  const raw = sessionStorage.getItem(HOME_BACK_HINT_KEY);
  if (raw) {
    const hint = JSON.parse(raw) as { ts?: number; qs?: string };
    const ok = !!hint.ts && Date.now() - hint.ts < HOME_BACK_HINT_TTL;
    if (ok) isBackFromDetail = true;
  }
} catch {}

// ✅ match: nếu back từ detail thì luôn cho restore (miễn ttlOk)
const match =
  !!restored &&
  ttlOk &&
  (isBackFromDetail ||
    canonicalQs(restored.qs || "") === canonicalQs(url.qs || ""));

    // helper: kết thúc hydrate an toàn (2 RAF + mở persist trễ)
  function finishHydrate() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
      setTimeout(() => {
        persistBlockedRef.current = false;
        freezeFilterApplyRef.current = false; // ✅ mở lại filter apply
        navigatingAwayRef.current = false;    // ✅ an toàn thêm
        persistNow(false);
      }, 400);

        endHydrationAfterTwoFrames();
      });
    });
  }

  // ------------------ RESTORE FROM STORAGE ------------------
  if (match && restored) {
    const rest = restored;

    hydratingFromUrlRef.current = true;
   try {
    // ✅ LUÔN restore FILTER
    const restoredSearch = rest.search ?? "";
    const restoredPrice = rest.priceApplied ?? PRICE_DEFAULT;
    const restoredDistricts = rest.selectedDistricts ?? [];
    const restoredTypes = rest.selectedRoomTypes ?? [];
    const restoredMove = rest.moveFilter ?? null;
    const restoredSort = rest.sortMode ?? "updated_desc";

    setSearch(restoredSearch);
    setPriceDraft(restoredPrice);
    setPriceApplied(restoredPrice);
    setSelectedDistricts(restoredDistricts);
    setSelectedRoomTypes(restoredTypes);
    setMoveFilter(restoredMove);
    setSortMode(restoredSort);
    setTotal(typeof rest.total === "number" ? rest.total : null);
    setStatusFilter(rest.statusFilter ?? null);
    replaceUrlShallow(rest.qs || "");

    // ✅ Nếu reload: reset vị trí + trang về 0, GIỮ filter
    // - KHÔNG restore scroll/page
    // - Ưu tiên dùng SSR initialRooms để khỏi nháy trắng
    if (isReload && !isBackFromDetail) {
      setPageIndex(0);
      setDisplayPageIndex(0);

      if (initialRooms?.length) {
        pagesRef.current = [initialRooms];
        setPages([initialRooms]);

        cursorsRef.current = [null, initCursor];
        setHasNext(Boolean(initCursor));
        setFetchError("");
        setLoading(false);
        setShowSkeleton(false);
      } else {
        filtersVersionRef.current += 1;
        resetPagination(0);
        // fetch sẽ tự chạy bởi central fetch effect
      }

      const qsNoPage = buildQs({
        q: restoredSearch.trim(),
        min: restoredPrice[0],
        max: restoredPrice[1],
        d: restoredDistricts,
        t: restoredTypes,
        m: restoredMove,
        s: restoredSort,
        st: rest.statusFilter ?? null,
        p: 0,
      });
      replaceUrlShallow(qsNoPage);

      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = 0;
        lastScrollTopRef.current = 0;
      });

       try { sessionStorage.removeItem(HOME_BACK_HINT_KEY); } catch {}
      finishHydrate();
      return;
    }

   // (Giữ behavior cũ khi KHÔNG reload) - Hướng A: chỉ restore metadata
    pagesRef.current = [];
    setPages([]);

    cursorsRef.current = rest.cursors ?? [null];
    setHasNext(Boolean(rest.hasNext));

    const pIdx = rest.pageIndex ?? 0;
    const dIdx = rest.displayPageIndex ?? pIdx;

    pageIndexRef.current = pIdx;
    setPageIndex(pIdx);
    setDisplayPageIndex(dIdx);

    // ✅ set pending scroll NGAY, không RAF
    pendingScrollTopRef.current =
      typeof rest.scrollTop === "number" ? rest.scrollTop : 0;

    didRestoreFromStorageRef.current = true;

    try { sessionStorage.removeItem(HOME_BACK_HINT_KEY); } catch {}
    finishHydrate();
    return;

  } finally {
    queueMicrotask(() => {
      hydratingFromUrlRef.current = false;
    });
  }
}

  // ------------------ HYDRATE FROM URL (NO RESTORE) ------------------
  const hasAny =
    url.qs.length > 0 &&
    (new URLSearchParams(window.location.search).has(QS.q) ||
      new URLSearchParams(window.location.search).has(QS.min) ||
      new URLSearchParams(window.location.search).has(QS.max) ||
      new URLSearchParams(window.location.search).has(QS.d) ||
      new URLSearchParams(window.location.search).has(QS.t) ||
      new URLSearchParams(window.location.search).has(QS.m) ||
      new URLSearchParams(window.location.search).has(QS.s) ||
      new URLSearchParams(window.location.search).has(QS.st) ||
      new URLSearchParams(window.location.search).has(QS.p));

  if (!hasAny) {
    // vẫn cần mở persist sau hydrate
    finishHydrate();
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
setStatusFilter(url.st);

queueMicrotask(() => {
  hydratingFromUrlRef.current = false;
});



  // ✅ reload thì ép page về 0 + scrollTop=0
  const pageFromUrl = isReload ? 0 : url.nextPage;

  filtersVersionRef.current += 1;

  if (isReload) {
    setPageIndex(0);
    setDisplayPageIndex(0);

    if (initialRooms?.length) {
      pagesRef.current = [initialRooms];
      setPages([initialRooms]);
      cursorsRef.current = [null, initCursor];
      setHasNext(Boolean(initCursor));
      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);
      setTotal(typeof initialTotal === "number" ? initialTotal : null);

    } else {
      resetPagination(0);
    }

    const qsNoPage = buildQs({
      q: url.q.trim(),
      min: url.minVal,
      max: url.maxVal,
      d: url.d,
      t: url.t,
      m: url.m,
      s: url.s,
      p: 0,
    });
    replaceUrlShallow(qsNoPage);

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });
  } else {
    resetPagination(pageFromUrl);
  }

  finishHydrate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


// ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const finishHydratePop = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
        persistBlockedRef.current = false;
        freezeFilterApplyRef.current = false;
        navigatingAwayRef.current = false;
        persistNow(false);
      }, 400);
        endHydrationAfterTwoFrames(); // sẽ set hydratingFromUrlRef.current = false sau 2 RAF
      });
    });
  };

  

  const onPop = () => {
// ✅ ƯU TIÊN RESTORE TỪ HISTORY (100% ĐÚNG KHI BACK)
const hs = window.history.state?.__home;
if (hs?.qs) {
  persistBlockedRef.current = true;
  skipNextFilterEffectRef.current = true;
  restoringRef.current = true;

  replaceUrlShallow(hs.qs);

  setSearch(hs.search ?? "");
  setPriceApplied(hs.priceApplied ?? PRICE_DEFAULT);
  setSelectedDistricts(hs.selectedDistricts ?? []);
  setSelectedRoomTypes(hs.selectedRoomTypes ?? []);
  setMoveFilter(hs.moveFilter ?? null);
  setSortMode(hs.sortMode ?? "updated_desc");
  setStatusFilter(hs.statusFilter ?? null);

  pageIndexRef.current = hs.pageIndex ?? 0;
  setPageIndex(pageIndexRef.current);
  setDisplayPageIndex(pageIndexRef.current);

  pendingScrollTopRef.current = hs.scrollTop ?? 0;

  finishHydratePop();
  return;
}

    // chặn persist + chặn filter-effect trong lúc restore
    persistBlockedRef.current = true;
    skipNextFilterEffectRef.current = true;
    
    const url = readUrlState();
    setStatusFilter(url.st ?? null);

    // 1) ưu tiên restore từ sessionStorage
    let restored: PersistState | null = null;
    try {
      const raw = sessionStorage.getItem(HOME_STATE_KEY);
      if (raw) restored = JSON.parse(raw) as PersistState;
    } catch {
      restored = null;
    }

    const ttlOk = restored?.ts ? Date.now() - restored.ts < 30 * 60 * 1000 : false;

    // detect back-from-detail
    let isBackFromDetail = false;
    try {
      const raw = sessionStorage.getItem(HOME_BACK_HINT_KEY);
      if (raw) {
        const hint = JSON.parse(raw) as { ts?: number; qs?: string };
        const ok = !!hint.ts && Date.now() - hint.ts < HOME_BACK_HINT_TTL;
        if (ok) isBackFromDetail = true;
      }
    } catch {}

    const match =
      !!restored &&
      ttlOk &&
      (isBackFromDetail ||
        canonicalQs(restored.qs || "") === canonicalQs(url.qs || ""));

    // ------------------ RESTORE FROM STORAGE ------------------
    if (match && restored) {
      const rest = restored;

      hydratingFromUrlRef.current = true;
      try {
        // restore filters
        setSearch(rest.search ?? "");
        setPriceDraft(rest.priceApplied ?? PRICE_DEFAULT);
        setPriceApplied(rest.priceApplied ?? PRICE_DEFAULT);
        setSelectedDistricts(rest.selectedDistricts ?? []);
        setSelectedRoomTypes(rest.selectedRoomTypes ?? []);
        setMoveFilter(rest.moveFilter ?? null);
        setSortMode(rest.sortMode ?? "updated_desc");
        setTotal(typeof rest.total === "number" ? rest.total : null);
        setStatusFilter(rest.statusFilter ?? null);

        // ép URL về đúng state đã persist
        replaceUrlShallow(rest.qs || "");

        // Hướng A: không restore pages
        pagesRef.current = [];
        setPages([]);

        cursorsRef.current = rest.cursors ?? [null];
        setHasNext(Boolean(rest.hasNext));

        const pIdx = rest.pageIndex ?? 0;
        const dIdx = rest.displayPageIndex ?? pIdx;
        restoringRef.current = true;

        pageIndexRef.current = pIdx;
        setPageIndex(pIdx);
        setDisplayPageIndex(dIdx);

        // tránh màn hình trắng khi đang fetch
        setShowSkeleton(true);

        // pending scroll sẽ được apply sau khi pages của pIdx về
        pendingScrollTopRef.current =
          typeof rest.scrollTop === "number" ? rest.scrollTop : 0;

        // quan trọng: back-from-detail chỉ dùng 1 lần
        try { sessionStorage.removeItem(HOME_BACK_HINT_KEY); } catch {}

        // vì pages đang trống nên phải fetch lại page hiện tại
        fetchPageRef.current(pIdx);

        finishHydratePop();
        return;
      } catch {
        // nếu có lỗi thì rơi xuống fallback
      }
    }

    // ------------------ FALLBACK: hydrate theo URL + fetch ------------------
    hydratingFromUrlRef.current = true;

    setSearch(url.q);
    setPriceDraft([url.minVal, url.maxVal]);
    setPriceApplied([url.minVal, url.maxVal]);
    setSelectedDistricts(url.d);
    setSelectedRoomTypes(url.t);
    setMoveFilter(url.m);
    setSortMode(url.s);
    setStatusFilter(url.st);

    filtersVersionRef.current += 1;

    pageIndexRef.current = url.nextPage;
    resetPagination(url.nextPage);

    fetchPageRef.current(url.nextPage);

    finishHydratePop();
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [
  readUrlState,
  replaceUrlShallow,
  resetPagination,
  endHydrationAfterTwoFrames,
]);

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

    // ✅ dùng ref để tránh stale closure của filterSig
    const reqKey = `${filterSigRef.current}::${targetIndex}`;

    // ✅ chặn gọi trùng khi đang bay (theo filter + page)
    if (inFlightRef.current[reqKey]) return;
    inFlightRef.current[reqKey] = true;

    const isVisible = targetIndex === pageIndexRef.current;

    if (isVisible) {
      setLoading(true);
      setShowSkeleton(true);
      setFetchError("");
    }

    try {
      const cursorForThisPage = cursorsRef.current[targetIndex] ?? null;

      const res = await fetchRooms({
        limit: LIMIT,
        cursor: cursorForThisPage,
        adminLevel,
        search: appliedSearch.trim() ? appliedSearch.trim() : undefined,
        minPrice: minPriceApplied,
        maxPrice: maxPriceApplied,
        sortMode,
        status: statusFilter,
        districts: selectedDistricts.length ? selectedDistricts : undefined,
        roomTypes: selectedRoomTypes.length ? selectedRoomTypes : undefined,
        move: moveFilter ?? undefined,
      });

      // ✅ drop nếu version đã đổi sau khi request bắt đầu
      if (myVersion !== filtersVersionRef.current) return;

      if (typeof res.total === "number") setTotal(res.total);

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

      // ===== Idle prefetch NEXT page (UX nhanh) =====
      // ❌ đừng prefetch khi page này không còn là page đang đứng (tránh race)
      if (targetIndex !== pageIndexRef.current) return;

      const shouldPrefetch = Boolean(res.nextCursor) && deduped.length === LIMIT;
      if (!shouldPrefetch) return;

      const nextIdx = targetIndex + 1;
      const notFetchedYet = pagesRef.current[nextIdx] === undefined;

      // ✅ inFlightRef dùng key string, không phải index number
      const nextKey = `${filterSigRef.current}::${nextIdx}`;
      const notInFlight = !inFlightRef.current[nextKey];

      if (!notFetchedYet || !notInFlight) return;

      const idle = (cb: () => void) => {
        const ric = (window as any).requestIdleCallback as
          | undefined
          | ((fn: any) => any);
        if (ric) ric(cb);
        else setTimeout(cb, 0);
      };

      idle(() => {
        // nếu filter đã đổi thì bỏ
        if (myVersion !== filtersVersionRef.current) return;
        fetchPageRef.current(nextIdx);
      });
    } catch (e: any) {
      if (isVisible && myVersion === filtersVersionRef.current) {
        setFetchError(e?.message ?? "Fetch failed");
      }
    } finally {
      inFlightRef.current[reqKey] = false;

      // ✅ tắt skeleton nếu page đã có trạng thái (kể cả [])
      const fetched = pagesRef.current[targetIndex] !== undefined;
      if (isVisible && fetched) {
        setLoading(false);
        setShowSkeleton(false);
      }
    }
  },
  [
    adminLevel,
    appliedSearch,
    minPriceApplied,
    maxPriceApplied,
    sortMode,
    statusFilter,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
  ]
);

useEffect(() => {
  fetchPageRef.current = fetchPage;
}, [fetchPage]);



// ================== CENTRAL FETCH ==================
useEffect(() => {
  if (didRestoreFromStorageRef.current) {
    didRestoreFromStorageRef.current = false;
  }

  const cached = pagesRef.current[pageIndex];

  // ✅ nếu chưa có page -> fetch
  if (cached === undefined) {
    fetchPage(pageIndex);
    return;
  }

  // ✅ đã có data -> hiển thị page
  setShowSkeleton(false);
  setDisplayPageIndex(pageIndex);

  // ✅ nếu đang restore/back thì CHỈ mở khóa sau khi page đã sẵn sàng
  if (restoringRef.current) {
    // nếu KHÔNG có pending scroll thì coi như restore xong luôn
    if (pendingScrollTopRef.current == null) {
      restoringRef.current = false;
    }
  }
}, [pageIndex, fetchPage]);

// ================== APPLY PENDING SCROLL (after pages ready) ==================
useEffect(() => {
  const pending = pendingScrollTopRef.current;
  if (pending == null) return;

  const cached = pagesRef.current[pageIndex];
  if (cached === undefined) return; // chưa có data thì chưa apply

  pendingScrollTopRef.current = null;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;

      el.scrollTop = pending;
      lastScrollTopRef.current = pending;

      setShowSkeleton(false);

      // ✅ scroll đã apply xong => restore thật sự hoàn tất
      restoringRef.current = false;
    });
  });
}, [pages, pageIndex]);


// ================== SCROLL PERSIST (không gây fetch) ==================
useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;

  let raf = 0;

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      lastScrollTopRef.current = el.scrollTop;
      persistSoon();
    });
  };

  el.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    el.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
  };
}, [persistSoon]);

const prevAppliedSearchRef = useRef<string>("");

type BaselineState = {
  pages: any[][];
  cursors: typeof cursorsRef.current;
  pageIndex: number;
  displayPageIndex: number;
  scrollTop: number;
  hasNext: boolean;
};

const preSearchBaselineRef = useRef<BaselineState | null>(null);

// ================== FILTER CHANGE ==================
const lastFilterSigRef = useRef<string>("");

const districtsSig = useMemo(
  () => [...selectedDistricts].sort().join("|"),
  [selectedDistricts]
);

const roomTypesSig = useMemo(
  () => [...selectedRoomTypes].sort().join("|"),
  [selectedRoomTypes]
);

const filterSig = useMemo(() => {
  const applied = appliedSearch.trim();
  return [
    applied,
    String(priceApplied[0]),
    String(priceApplied[1]),
    districtsSig,
    roomTypesSig,
    moveFilter ?? "",
    sortMode ?? "",
    statusFilter ?? "",
  ].join("~");
}, [
  appliedSearch,
  priceApplied,
  districtsSig,
  roomTypesSig,
  moveFilter,
  sortMode,
  statusFilter,
]);

const filterSigRef = useRef<string>("");
useEffect(() => {
  filterSigRef.current = filterSig;
}, [filterSig]);

useEffect(() => {
  const applied = appliedSearch.trim();
  

  // ✅ nếu vừa hydrate (initial/popstate/restore) thì bỏ qua 1 nhịp FILTER CHANGE
  if (skipNextFilterEffectRef.current) {
    skipNextFilterEffectRef.current = false;

    lastFilterSigRef.current = filterSig;
    prevAppliedSearchRef.current = appliedSearch.trim();
    return;
  }
  if (freezeFilterApplyRef.current) return;
  if (hydratingFromUrlRef.current) return;

  // ✅ đang restore/back: đừng reset page về 0 + đừng replaceUrl/persist
  if (persistBlockedRef.current) return;
  if (navigatingAwayRef.current) return;

  // ✅ tránh nhịp debounce làm filterSig đổi ngay sau restore/back
  if (search.trim() !== appliedSearch.trim()) return;

  if (filterSig === lastFilterSigRef.current) return;
  lastFilterSigRef.current = filterSig;

  if (restoringRef.current) return;

  const prevApplied = prevAppliedSearchRef.current;
  prevAppliedSearchRef.current = applied;

  const searchBecameNonEmpty = prevApplied === "" && applied !== "";
  const searchBecameEmpty = prevApplied !== "" && applied === "";

  if (searchBecameNonEmpty) {
    const el = scrollRef.current;
    preSearchBaselineRef.current = {
      pages: pagesRef.current,
      cursors: cursorsRef.current,
      pageIndex: pageIndexRef.current,
      displayPageIndex: displayPageIndex,
      scrollTop: el ? el.scrollTop : 0,
      hasNext: hasNext,
    };
  }

  if (searchBecameEmpty && preSearchBaselineRef.current) {
    const base = preSearchBaselineRef.current;

    pagesRef.current = base.pages;
    setPages(base.pages);

    cursorsRef.current = base.cursors;
    setHasNext(base.hasNext);

    pageIndexRef.current = base.pageIndex;   // ✅ FIX
    setPageIndex(base.pageIndex);
    setDisplayPageIndex(base.displayPageIndex);

    const qsBack = buildQs({
      q: "",
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
      p: base.pageIndex,
    });

    preSearchBaselineRef.current = null;

    replaceUrlShallow(qsBack);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop = base.scrollTop;
          lastScrollTopRef.current = base.scrollTop;
        }
      });
    });

    persistSoon();
    return;
  }

  // ====== Normal filter change flow (debounced) ======
  filtersVersionRef.current += 1;

  const qs = buildQs({
    q: applied,
    min: priceApplied[0],
    max: priceApplied[1],
    d: selectedDistricts,
    t: selectedRoomTypes,
    m: moveFilter,
    s: sortMode,
    st: statusFilter,
    p: 0,
  });

  if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);

  filterApplyTimerRef.current = window.setTimeout(() => {
    replaceUrlShallow(qs);
    setTotal(null);
    setDisplayPageIndex(0);
    resetPagination(0);
    fetchPage(0);
    persistSoon();
  }, 200);

  return () => {
    if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);
  };
}, [
  filterSig,
  appliedSearch,
  priceApplied,
  buildQs,
  replaceUrlShallow,
  resetPagination,
  persistSoon,
  fetchPage,
  displayPageIndex,
  hasNext,
  search, // ✅ thêm dep vì dùng search trong guard
]);

  // ================== NEXT / PREV ==================
  const goNext = useCallback(() => {
    if (loading || !hasNext) return;

    const next = pageIndex + 1;
    pageIndexRef.current = next;
    setPageIndex(next);

    const qs = buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
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
    pageIndexRef.current = next;
    setPageIndex(next);

    const qs = buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
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
    statusFilter,
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
        <div className="relative lg:sticky lg:top-0 lg:z-[900] bg-gray-200">
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

              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}

              sortMode={sortMode}
              setSortMode={setSortMode}
              total={total}
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
        <Pagination goNext={goNext} goPrev={goPrev} hasNext={hasNext} loading={loading}
        total={typeof total === "number" ? total : undefined} />
      </div>

      {/* portal root nếu bạn đang dùng */}
      <div id="portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
    </div>
  );
};

export default HomeClient;
