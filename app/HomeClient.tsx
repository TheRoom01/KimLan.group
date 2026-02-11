"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterBar, { SortMode } from "@/components/FilterBar";
import RoomList from "@/components/RoomList";
import Pagination from "@/components/Pagination";
import { fetchRooms, type UpdatedDescCursor } from "@/lib/fetchRooms";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";
import LogoIntroButton from "@/components/LogoIntroButton";


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
  c: "c", // ✅ cursor
} as const;

const LIST_SEP = ",";

// URLSearchParams đã tự encode/decode rồi => không encode/decode thủ công nữa
function parseList(v: string | null) {
  if (!v) return [];
  return v.split(LIST_SEP).map((x) => x.trim()).filter(Boolean);
}

function toListParam(arr: string[]) {
  return arr.map((x) => String(x).trim()).filter(Boolean).join(LIST_SEP);
}

type UrlCursor = string | UpdatedDescCursor | null;

function encodeCursor(c: UrlCursor): string | null {
  if (!c) return null;
  const json = JSON.stringify(c);
  const b64 = typeof window === "undefined"
    ? Buffer.from(json, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(raw: string | null): UrlCursor {
  if (!raw) return null;
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((raw.length + 3) % 4);

  const json = typeof window === "undefined"
    ? Buffer.from(b64, "base64").toString("utf8")
    : decodeURIComponent(escape(atob(b64)));

  return JSON.parse(json);
}

const PRICE_DEFAULT: [number, number] = [3_000_000, 30_000_000];

const HomeClient = ({
  initialRooms,
  initialNextCursor,
  initialAdminLevel,
  initialTotal,
}: InitialProps) => {

  const pathname = usePathname();
  const router = useRouter();

  const homePathRef = useRef<string>("");      // pathname của Home lúc mount
  
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(
   typeof initialTotal === "number" ? initialTotal : null);
  
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

  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const lastFilterSigRef = useRef<string>("");

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

const filterSig = useMemo(() => {
  return [
    appliedSearch.trim(),
    minPriceApplied,
    maxPriceApplied,
    selectedDistricts.join(","),
    selectedRoomTypes.join(","),
    moveFilter ?? "",
    sortMode,
    statusFilter ?? "",
  ].join("|");
}, [
  appliedSearch,
  minPriceApplied,
  maxPriceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  statusFilter,
]);

// ================== PAGINATION (cache) ==================
 const initCursor: string | UpdatedDescCursor | null =
  initialNextCursor && typeof initialNextCursor === "object"
    ? {
        id: String((initialNextCursor as any).id),
        updated_at: String((initialNextCursor as any).updated_at),
        created_at: String(
          (initialNextCursor as any).created_at ?? (initialNextCursor as any).updated_at
        ),
      }
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
   const didApplyBackOnceRef = useRef(false);
    const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");
  const fetchPageRef = useRef<(targetIndex: number) => void>(() => {});
  const pendingFetchIndexRef = useRef<number | null>(null); // ✅ đảm bảo fetch không bị noop

 const isReloadRef = useRef<boolean>(false);

  const inFlightRef = useRef<Record<string, boolean>>({});

  // ================== GUARDS ==================
  const hydratingFromUrlRef = useRef(false);
  const filtersVersionRef = useRef(0); // "đợt filter" để drop response cũ
  const pendingUrlFiltersRef = useRef<{
  search: string;
  min: number;
  max: number;
  districts: string[];
  roomTypes: string[];
  move: "elevator" | "stairs" | null;
  sort: SortMode;
  status: string | null;
} | null>(null);


const pageIndexRef = useRef(0);
useEffect(() => {
pageIndexRef.current = pageIndex;
}, [pageIndex]);

// ================== Effect =============
useEffect(() => {
  // chỉ set lần đầu
  if (!homePathRef.current) homePathRef.current = pathname;
}, []);
  
  // ✅ skip FILTER CHANGE mỗi khi ta "hydrate state" (initial / popstate / restore)
  const skipNextFilterEffectRef = useRef(false);

  // scroll container
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
const lastPageIndexRef = useRef(0);
const lastDisplayPageIndexRef = useRef(0);
const pendingScrollTopRef = useRef<number | null>(null); // ✅ chờ render xong mới restore

// ================== HISTORY SCROLL RESTORE ==================
const makeListKey = useCallback(() => {
  // ✅ key ổn định theo filter + page, KHÔNG theo cursor (c)
  const sp = new URLSearchParams(window.location.search);

  // bỏ cursor khỏi key để tránh key đổi liên tục theo pagination cursor
  sp.delete(QS.c);

  const qs = canonicalQs(sp.toString());
  return qs ? `${pathname}?${qs}` : pathname;
}, [pathname]);

const saveScrollToHistory = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;

  const key = makeListKey();
  const scrollTop = el.scrollTop;

  const prev = (history.state ?? {}) as any;
  const next = {
    ...prev,
    __listScroll: {
      ...(prev.__listScroll ?? {}),
      [key]: scrollTop,
    },
  };

  // replaceState không tạo entry mới, chỉ update state entry hiện tại
  history.replaceState(next, "", window.location.href);
}, [makeListKey]);

const restoreScrollFromHistory = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return false;

  const key = makeListKey();
  const st = (history.state as any)?.__listScroll?.[key];

  if (typeof st !== "number") return false;

  pendingScrollTopRef.current = st; // ✅ chỉ lưu pending, apply sau
  return true;

}, [makeListKey]);

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
    c?: UrlCursor; // ✅ thêm cursor
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

    // ✅ URLSearchParams tự encode
    setOrDel(QS.st, next.st ? next.st : null);

    setOrDel(QS.p, typeof next.p === "number" ? String(next.p) : null);

    // ✅ cursor in URL: base64url(JSON)
    setOrDel(QS.c, next.c ? encodeCursor(next.c) : null);

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
  (nextQsRaw: string) => {
    const currentQsRaw = window.location.search.replace(/^\?/, "");

    // ✅ normalize để không bị “nhảy URL” do khác thứ tự param
    const nextQs = canonicalQs(nextQsRaw || "");
    const currentQs = canonicalQs(currentQsRaw || "");

    if (nextQs === currentQs) return;

    const url = nextQs ? `${pathname}?${nextQs}` : pathname;

    // ✅ App Router-safe
    router.replace(url, { scroll: false });
  },
  [pathname, router]
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

  // ✅ cursor
  const cRaw = sp.get(QS.c);
  const c = decodeCursor(cRaw);

  const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
  const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];
  const nextPage = Number.isFinite(p) && p >= 0 ? p : 0;

  const st = sp.get(QS.st) || null;
  const qs = canonicalQs(sp.toString());

  return { qs, q, minVal, maxVal, d, t, m, s, st, nextPage, c };
}, []);


useEffect(() => {
  const onPageHide = () => {
    saveScrollToHistory();
  };

  const onVisibility = () => {
    if (document.visibilityState !== "hidden") return;
    saveScrollToHistory();
  };

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, [saveScrollToHistory]);


  // ================== RESET PAGINATION ==================
 const resetPagination = useCallback((keepPage: number = 0) => {
  // ✅ chỉ reset UI/cache, KHÔNG “kill request” bằng requestId
  inFlightRef.current = {};

  // ✅ IMPORTANT:
  // fetchPage() uses "!== undefined" to decide if a page was already fetched.
  // So after reset we must ensure pagesRef slots are truly undefined, not just an empty array
  // that can later get treated as "already has page 0".
  const nextPages: any[][] = new Array(keepPage + 1);
  // leave all entries as undefined
  pagesRef.current = nextPages;
  setPages(nextPages);

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
      skipNextFilterEffectRef.current = false; // ✅ failsafe: tránh kẹt guard
    });
  });
}, []);

const requestFetchPage = useCallback((idx: number) => {
  // nếu fetchPageRef chưa sẵn sàng (vẫn noop) thì giữ lại để chạy sau
  pendingFetchIndexRef.current = idx;

  // thử gọi ngay (nếu ref đã sẵn thì chạy luôn)
  queueMicrotask(() => {
    const fn = fetchPageRef.current;
    if (fn) fn(idx);
  });
}, []);

// ================== DETERMINISTIC SCROLL RESTORE ==================
// Áp dụng sau khi pages thay đổi (list đã render xong)
useEffect(() => {
  if (pendingScrollTopRef.current == null) return;

  const y = pendingScrollTopRef.current;
  pendingScrollTopRef.current = null;

  const el = scrollRef.current;
  if (!el) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (!target) return;
      target.scrollTop = y;
    });
  });

}, [pages]);

 // ================== HYDRATE (ONCE) ==================
useEffect(() => {
  if (didHydrateOnceRef.current) return;
  didHydrateOnceRef.current = true;
  // ✅ chặn FILTER CHANGE effect chạy ngay sau hydrate
  skipNextFilterEffectRef.current = true;
 
  // Detect reload (F5 / pull-to-refresh)
 const navType =
  (
    performance.getEntriesByType("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined
  )?.type ?? "navigate";

isReloadRef.current = navType === "reload";



  // 1) read URL
  let url = readUrlState();

  // helper: kết thúc hydrate an toàn (2 RAF + mở persist trễ)
  function finishHydrate() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        
        endHydrationAfterTwoFrames();
         // ✅ quan trọng: chỉ coi "reload" đúng cho lần mount đầu tiên
      isReloadRef.current = false;
      });
    });
  }

  
// ✅ RELOAD: vẫn tuân theo URL (KHÔNG tự clear URL về "/")
if (isReloadRef.current) {
  hydratingFromUrlRef.current = true;
  try {
    // drop mọi response cũ (nếu có request đang bay)
    filtersVersionRef.current += 1;

    // ✅ URL là nguồn sự thật: hydrate filter từ URL hiện tại
    pendingUrlFiltersRef.current = {
      search: url.q,
      min: url.minVal,
      max: url.maxVal,
      districts: url.d,
      roomTypes: url.t,
      move: url.m,
      sort: url.s,
      status: null, // reload: không giữ status nếu bạn muốn, hoặc dùng url.st nếu cần
    };

    setSearch(url.q);
    setPriceDraft([url.minVal, url.maxVal]);
    setPriceApplied([url.minVal, url.maxVal]);
    setSelectedDistricts(url.d);
    setSelectedRoomTypes(url.t);
    setMoveFilter(url.m);
    setSortMode(url.s);
    setStatusFilter(null);

    // ✅ page theo URL (hoặc ép 0 nếu bạn muốn)
    const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
    resetPagination(pIdx);
    cursorsRef.current[pIdx] = url.c ?? null;

    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);

    // reload: scroll về top cho chắc
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });

    requestFetchPage(pIdx);

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
      new URLSearchParams(window.location.search).has(QS.p) ||
      new URLSearchParams(window.location.search).has(QS.c));

  if (!hasAny) {
    // vẫn cần mở persist sau hydrate
    finishHydrate();
    return;
  }

hydratingFromUrlRef.current = true;

// ✅ snapshot URL filters để fetch dùng ngay (không phụ thuộc timing setState)
pendingUrlFiltersRef.current = {
  search: url.q,
  min: url.minVal,
  max: url.maxVal,
  districts: url.d,
  roomTypes: url.t,
  move: url.m,
  sort: url.s,
  status: isReloadRef.current ? null : url.st,
};

setSearch(url.q);
setPriceDraft([url.minVal, url.maxVal]);
setPriceApplied([url.minVal, url.maxVal]);
setSelectedDistricts(url.d);
setSelectedRoomTypes(url.t);
setMoveFilter(url.m);
setSortMode(url.s);
setStatusFilter(isReloadRef.current ? null : url.st);


  // ✅ reload thì ép page về 0 + scrollTop=0
  const pageFromUrl = isReloadRef.current ? 0 : url.nextPage;

  filtersVersionRef.current += 1;

  if (isReloadRef.current) {
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
  // ✅ nếu URL có cursor thì dùng cursor đó cho page này
  cursorsRef.current[pageFromUrl] = url.c ?? null;

  // ✅ IMPORTANT: pageIndex có thể không đổi (thường là 0) => CENTRAL FETCH effect sẽ không chạy
  // Force fetch đúng page theo URL sau khi reset cache.
  queueMicrotask(() => {
    fetchPageRef.current(pageFromUrl);
  });
}

finishHydrate();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

 // ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const onPop = () => {
    // guard chống double fire
    if (didApplyBackOnceRef.current) return;
    didApplyBackOnceRef.current = true;

    // chặn persist + chặn FILTER CHANGE 1 nhịp
    skipNextFilterEffectRef.current = true;

    // 1) URL là nguồn sự thật
    const url = readUrlState();

    // snapshot URL filters để fetch dùng NGAY (không phụ thuộc timing setState)
    pendingUrlFiltersRef.current = {
      search: url.q,
      min: url.minVal,
      max: url.maxVal,
      districts: url.d,
      roomTypes: url.t,
      move: url.m,
      sort: url.s,
      status: isReloadRef.current ? null : url.st,
    };

    // freeze signature theo URL để FILTER CHANGE không rewrite URL sau back
    lastFilterSigRef.current = [
      (url.q ?? "").trim(),
      url.minVal,
      url.maxVal,
      (url.d ?? []).join(","),
      (url.t ?? []).join(","),
      url.m ?? "",
      url.s ?? "updated_desc",
      (isReloadRef.current ? null : (url.st ?? "")) ?? "",
    ].join("|");

    prevAppliedSearchRef.current = (url.q ?? "").trim();

    // 2) hydrate FILTER theo URL
    hydratingFromUrlRef.current = true;
    try {
      setSearch(url.q);
      setPriceDraft([url.minVal, url.maxVal]);
      setPriceApplied([url.minVal, url.maxVal]);
      setSelectedDistricts(url.d);
      setSelectedRoomTypes(url.t);
      setMoveFilter(url.m);
      setSortMode(url.s);
      setStatusFilter(isReloadRef.current ? null : url.st);

      // 3) PAGE theo URL
      const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
      setPageIndex(pIdx);
      setDisplayPageIndex(pIdx);

      // 4) cursor theo URL (nếu có)
      cursorsRef.current[pIdx] = url.c ?? null;

      // 5) scroll: CHỈ restore từ history.state
      restoreScrollFromHistory();

      // 6) reset cache để tránh hiển thị nhầm page cũ khi URL đổi
      filtersVersionRef.current += 1;
      resetPagination(pIdx);

      // 7) fetch theo URL (bắt buộc)
      requestFetchPage(pIdx);

    } finally {
      // mở lại flags sau 2 frame để UI render ổn định
      endHydrationAfterTwoFrames();

      setTimeout(() => {
      didApplyBackOnceRef.current = false;
      }, 400);

      queueMicrotask(() => {
        hydratingFromUrlRef.current = false;
      });
    }
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [
  readUrlState,
  resetPagination,
  endHydrationAfterTwoFrames,
  requestFetchPage,
  restoreScrollFromHistory,
]);


  // ================== FETCH PAGE ==================
  const fetchPage = useCallback(
  async (targetIndex: number) => {
    const myVersion = filtersVersionRef.current;

    if (pagesRef.current[targetIndex] !== undefined) {
  setShowSkeleton(false);
  return;
}

const reqKey = `${lastFilterSigRef.current ?? ""}::${targetIndex}`;

if (inFlightRef.current[reqKey]) {
  return;
}

inFlightRef.current[reqKey] = true;

const isVisible = targetIndex === pageIndexRef.current;

    if (isVisible) {
      setLoading(true);
      setShowSkeleton(true);
      setFetchError("");
    }

    try {
      const cursorForThisPage = cursorsRef.current[targetIndex] ?? null;

      const pending = pendingUrlFiltersRef.current;

const res = await fetchRooms({
  limit: LIMIT,
  cursor: cursorForThisPage,
  adminLevel,

  // ✅ ưu tiên URL snapshot khi đang hydrate-from-URL
  search: (pending?.search ?? appliedSearch).trim()
    ? (pending?.search ?? appliedSearch).trim()
    : undefined,

  minPrice: pending?.min ?? minPriceApplied,
  maxPrice: pending?.max ?? maxPriceApplied,
  sortMode: pending?.sort ?? sortMode,
  status: pending?.status ?? statusFilter,

  districts: (pending?.districts ?? selectedDistricts).length
    ? (pending?.districts ?? selectedDistricts)
    : undefined,

  roomTypes: (pending?.roomTypes ?? selectedRoomTypes).length
    ? (pending?.roomTypes ?? selectedRoomTypes)
    : undefined,

  move: pending?.move ?? moveFilter ?? undefined,
});

// ✅ sau lần fetch đầu tiên theo URL snapshot thì clear để các fetch sau dùng state bình thường
if (pendingUrlFiltersRef.current && targetIndex === pageIndexRef.current) {
  pendingUrlFiltersRef.current = null;
}

    
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
      // ❌ đừng prefetch khi vừa reset/filter
     if (targetIndex !== pageIndexRef.current) return;
      const shouldPrefetch = Boolean(res.nextCursor) && deduped.length === LIMIT;
      
      if (shouldPrefetch) {
        const nextIdx = targetIndex + 1;

        const notFetchedYet = pagesRef.current[nextIdx] === undefined;
       const nextReqKey = `${lastFilterSigRef.current ?? ""}::${nextIdx}`;
        const notInFlight = !inFlightRef.current[nextReqKey];

        if (notFetchedYet && notInFlight) {
          const idle = (cb: () => void) => {
            const ric = (window as any).requestIdleCallback as undefined | ((fn: any) => any);
            if (ric) ric(cb);
            else setTimeout(cb, 0);
          };

          idle(() => {
            // nếu filter đã đổi thì bỏ
            if (myVersion !== filtersVersionRef.current) return;
            fetchPageRef.current(nextIdx);
          });
        }
      }

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

  // ✅ flush pending fetch nếu trước đó hydrate/popstate đã yêu cầu fetch
  const pending = pendingFetchIndexRef.current;
  if (pending != null) {
    pendingFetchIndexRef.current = null;
    fetchPage(pending);
  }
 }, [fetchPage]);

  // ================== CENTRAL FETCH ==================
useEffect(() => {
  const cached = pagesRef.current[pageIndex];

  // ✅ nếu page chưa từng fetch (undefined) -> luôn fetch
  if (cached === undefined) {
    setShowSkeleton(true);
    fetchPage(pageIndex);
    return;
  }

  // cached có thể là [] => vẫn là "đã fetch"
  setShowSkeleton(false);
  setDisplayPageIndex(pageIndex);
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
        lastScrollTopRef.current = el.scrollTop;

        // ✅ update history scroll (throttle theo raf)
        saveScrollToHistory();

      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
}, [saveScrollToHistory]);

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

useEffect(() => {
  
   const applied = appliedSearch.trim();

  // ✅ nếu vừa hydrate (initial/popstate/restore) thì bỏ qua 1 nhịp FILTER CHANGE
  if (skipNextFilterEffectRef.current) {
  skipNextFilterEffectRef.current = false;

  // ✅ URL = source of truth: freeze signature theo URL hiện tại
  const urlNow = readUrlState();
  lastFilterSigRef.current = [
    (urlNow.q ?? "").trim(),
    urlNow.minVal,
    urlNow.maxVal,
    (urlNow.d ?? []).join(","),
    (urlNow.t ?? []).join(","),
    urlNow.m ?? "",
    urlNow.s ?? "updated_desc",
    (isReloadRef.current ? null : (urlNow.st ?? "")) ?? "",
  ].join("|");
  prevAppliedSearchRef.current = (urlNow.q ?? "").trim();

  return;
 }

 if (hydratingFromUrlRef.current) {
  // ✅ URL = source of truth: freeze signature theo URL hiện tại
  const urlNow = readUrlState();
  lastFilterSigRef.current = [
    (urlNow.q ?? "").trim(),
    urlNow.minVal,
    urlNow.maxVal,
    (urlNow.d ?? []).join(","),
    (urlNow.t ?? []).join(","),
    urlNow.m ?? "",
    urlNow.s ?? "updated_desc",
    (isReloadRef.current ? null : (urlNow.st ?? "")) ?? "",
  ].join("|");
  prevAppliedSearchRef.current = (urlNow.q ?? "").trim();

  return;
 }

  // ✅ normalize filter -> signature primitive để tránh array reference gây reset giả
  
  if (filterSig === lastFilterSigRef.current) return;
lastFilterSigRef.current = filterSig;

  // ====== Special logic for SEARCH baseline ======
  const prevApplied = prevAppliedSearchRef.current;
  prevAppliedSearchRef.current = applied;

  const searchBecameNonEmpty = prevApplied === "" && applied !== "";
  const searchBecameEmpty = prevApplied !== "" && applied === "";

  // ✅ Khi bắt đầu search: lưu baseline (list/scroll/page trước search)
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

  // ✅ Khi xoá search: restore baseline (quay lại đúng UI trước search), KHÔNG reset/fetch
  if (searchBecameEmpty && preSearchBaselineRef.current) {
    const base = preSearchBaselineRef.current;

    pagesRef.current = base.pages;
    setPages(base.pages);

    cursorsRef.current = base.cursors;
    setHasNext(base.hasNext);

    setPageIndex(base.pageIndex);
    setDisplayPageIndex(base.displayPageIndex);

    // update URL về trạng thái không search + giữ đúng page trước search
    const qsBack = buildQs({
      q: "", // không search
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
      p: base.pageIndex,
    });

    // clear baseline để lần search sau lưu lại mới
    preSearchBaselineRef.current = null;

    // apply ngay, không debounce
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

    return;
  }

   // ====== Normal filter change flow (ATOMIC, NO DEBOUNCE) ======
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

// 1) URL đổi ngay
replaceUrlShallow(qs);

// 2) reset cache ngay
setTotal(null);
setDisplayPageIndex(0);
resetPagination(0);

// 3) fetch ngay
fetchPage(0);

return;

  }, [
  filterSig,
  appliedSearch,
  priceApplied,
  buildQs,
  replaceUrlShallow,
  resetPagination,
  fetchPage,
  displayPageIndex,
  hasNext,
  readUrlState, // ✅ add
 ]);

// ================== NEXT / PREV ==================
const goNext = useCallback(() => {
  if (loading || !hasNext) return;

  const next = pageIndex + 1;

  // ✅ cursor để fetch trang "next" đã được lưu ở cursorsRef[next]
  const nextCursor = (cursorsRef.current[next] ?? null) as UrlCursor;
  if (!nextCursor) return; // chưa có cursor thì chưa cho next (an toàn)

  setPageIndex(next);

// ✅ lưu scroll của entry hiện tại trước khi đổi URL
saveScrollToHistory();

const qs = buildQs({
  q: search.trim(),
  min: priceApplied[0],
  max: priceApplied[1],
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
  s: sortMode,
  st: statusFilter,
  p: next,          // optional: hiển thị page
  c: nextCursor,    // ✅ nguồn sự thật để fetch
});
replaceUrlShallow(qs);

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
  statusFilter,
  saveScrollToHistory,
]);

const goPrev = useCallback(() => {
  if (loading) return;

  const next = Math.max(0, pageIndex - 1);

  // ✅ page 0 -> cursor null, còn page khác -> cursor đã lưu ở cursorsRef[next]
  const prevCursor = (cursorsRef.current[next] ?? null) as UrlCursor;

  setPageIndex(next);

// ✅ lưu scroll của entry hiện tại trước khi đổi URL
saveScrollToHistory();

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
  c: prevCursor,
});
replaceUrlShallow(qs);

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
  statusFilter,
  saveScrollToHistory,
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
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, [resetPagination, pageIndex]);


  // ================== RENDER ==================
  return (
    <div className="flex flex-col h-screen">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24 bg-gray-200">
       <header className="relative z-50 h-[140px] sm:h-[160px] md:h-[220px]">
          <div className="absolute inset-0 overflow-hidden">
            <img
              src="/hero.jpg"
              alt="The Room"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>

          <div className="absolute left-0 right-0 top-0 z-[1000] pt-2 px-3 md:pt-4 md:px-8">
            <div className="mx-auto flex w-full max-w-[1200px] items-start justify-between">
              <div className="flex items-start gap-2 md:gap-3">
                <LogoIntroButton logoSrc="/logo.png" />

                <div className="mt-[2px] leading-tight text-white">
                  <div className="text-base md:text-lg font-semibold whitespace-nowrap">
                    The Room
                  </div>
                  <div className="text-xs md:text-sm text-white/85">
                    Cho thuê chung cư, căn hộ &amp; phòng trọ tại TP.HCM
                  </div>
                </div>
              </div>

              <div className="relative z-[1000] whitespace-nowrap self-start">
                <div id="auth-anchor" />
              </div>
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
                setStatusFilter(null);
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
