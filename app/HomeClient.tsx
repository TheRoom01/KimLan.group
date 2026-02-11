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

const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 15 * 60 * 1000; // 15 phút

// ✅ BACK SNAPSHOT (cấu trúc logic cũ để giữ page/scroll khi back từ detail)
const HOME_BACK_SNAPSHOT_KEY = "HOME_BACK_SNAPSHOT_V1";
const HOME_BACK_SNAPSHOT_TTL = 15 * 60 * 1000;

const HOME_STATE_KEY = "HOME_STATE_V2"; // giữ nguyên
const HOME_STATE_LITE_PREFIX = "HOME_STATE_LITE_V1::"; // ✅ per-qS key
const HOME_STATE_LITE_TTL = 30 * 60 * 1000; // 30 phút (đồng bộ V2)


type BackSnapshot = {
  qs: string;

  // ✅ filters
  total: number | null;
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;
  statusFilter: string | null;

  // ✅ cache + paging
  pageIndex: number;
  displayPageIndex: number;
  pages: any[][];
  cursors: (string | UpdatedDescCursor | null)[];
  hasNext: boolean;

  // ✅ scroll
  scrollTop: number;

  ts: number;
};

type PersistState = {
  qs: string;
  total: number | null;
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;
  statusFilter: string | null;

  pageIndex: number;
  displayPageIndex: number;
  pages: any[][];
  cursors: (string | UpdatedDescCursor | null)[];
  hasNext: boolean;

  scrollTop: number;
  ts: number;
};

type PersistLiteState = {
  qs: string; // canonical qs
  total: number | null;

  // filters
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;
  statusFilter: string | null;

  // minimal pagination + scroll
  pageIndex: number;
  displayPageIndex: number;
  hasNext: boolean;
  scrollTop: number;

  // guard
  ts: number;
};

const HomeClient = ({
  initialRooms,
  initialNextCursor,
  initialAdminLevel,
  initialTotal,
}: InitialProps) => {

  const pathname = usePathname();
  const router = useRouter();

  const homePathRef = useRef<string>("");      // pathname của Home lúc mount
  const listQsRef = useRef<string>("");        // qs ổn định của list
  const didRestoreFromStorageRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(
    typeof initialTotal === "number" ? initialTotal : null
  );
  const cursorStackRef = useRef<(UrlCursor)[]>([]);
const currentCursorRef = useRef<UrlCursor>(null);
const prevMoveFilterRef = useRef<"elevator" | "stairs" | null>(null);


    // ================== ROLE ==================
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);
 
  // ================== FILTER ==================
  
    const [priceDraft, setPriceDraft] = useState<[number, number]>(PRICE_DEFAULT);
  const [priceApplied, setPriceApplied] = useState<[number, number]>(PRICE_DEFAULT);
  const didHardReloadRef = useRef(false);
  const [minPriceApplied, maxPriceApplied] = useMemo(() => {
    const a = priceApplied[0];
    const b = priceApplied[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceApplied]);

  const districts = useMemo(() => [...DISTRICT_OPTIONS], []);
  const roomTypes = useMemo(() => [...ROOM_TYPE_OPTIONS], []);

  const filterApplyTimerRef = useRef<number | null>(null);
  // ✅ giữ QS đang chờ apply (do debounce 200ms) để có thể flush ngay khi rời list
  const pendingFilterApplyQsRef = useRef<string | null>(null);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const lastFilterSigRef = useRef<string>("");

  useEffect(() => {
  console.log("MOVE_FILTER_STATE =", moveFilter);
}, [moveFilter]);

  
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

useEffect(() => {
  didHardReloadRef.current = true;
}, []);


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
 const isReloadRef = useRef<boolean>(false);

  const requestIdRef = useRef(0);
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

useEffect(() => {
  const t = window.setTimeout(() => {
    if (hydratingFromUrlRef.current) {
      console.warn("Hydration stuck >1500ms, force disable hydration flags");
      hydratingFromUrlRef.current = false;
      skipNextFilterEffectRef.current = false;
    }
  }, 1500);

  return () => window.clearTimeout(t);
}, []);

// ================== Effect =============
useEffect(() => {
  // chỉ set lần đầu
  if (!homePathRef.current) homePathRef.current = pathname;
  // lưu qs hiện tại của Home ngay lúc mount
  listQsRef.current = window.location.search.replace(/^\?/, "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ✅ lưu qs canonical (ổn định)
    listQsRef.current = nextQs;
  },
  [pathname, router]
);

const syncPageToUrl = useCallback(
  (nextPageIndex: number) => {
    const nextQs = buildQs({
      q: appliedSearch.trim(),
      min: minPriceApplied,
      max: maxPriceApplied,
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      s: sortMode,
      st: statusFilter,
      p: nextPageIndex,
    });
    replaceUrlShallow(nextQs);
  },
  [
    appliedSearch,
    minPriceApplied,
    maxPriceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    statusFilter,
    buildQs,
    replaceUrlShallow,
  ]
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

  // ================== PERSIST (sessionStorage) ==================
  const persistRafRef = useRef<number | null>(null);

  const liteKeyForQs = useCallback((qsRaw: string) => {
  const c = canonicalQs(qsRaw || "");
  return `HOME_STATE_LITE_V1::${c}`;
}, []);

const writeLiteNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;
  if (persistBlockedRef.current) return;
  if (homePathRef.current && pathname !== homePathRef.current) return;

  // ✅ source-of-truth: lấy qs từ URL thật (không dùng listQsRef)
  const qsRaw = window.location.search.replace(/^\?/, "");
  listQsRef.current = qsRaw;

  const qs = canonicalQs(qsRaw);

  const payload = {
    qs,
    total: typeof total === "number" ? total : null,

    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    statusFilter,

    pageIndex: lastPageIndexRef.current,
    displayPageIndex: lastDisplayPageIndexRef.current,
    hasNext,
    scrollTop: lastScrollTopRef.current,
    ts: Date.now(),
  };

  try {
    sessionStorage.setItem(liteKeyForQs(qsRaw), JSON.stringify(payload));
  } catch {}
}, [
  hasNext,
  liteKeyForQs,
  moveFilter,
  pathname,
  priceApplied,
  search,
  selectedDistricts,
  selectedRoomTypes,
  sortMode,
  statusFilter,
  total,
]);

const readLiteForQs = useCallback(
  (urlQs: string) => {
    try {
      const raw = sessionStorage.getItem(liteKeyForQs(urlQs || ""));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { qs?: string; ts?: number };

      const ttlOk = !!parsed?.ts && Date.now() - parsed.ts < 30 * 60 * 1000;
      const qsOk = canonicalQs(parsed?.qs || "") === canonicalQs(urlQs || "");
      if (!ttlOk || !qsOk) return null;

      return parsed as any;
    } catch {
      return null;
    }
  },
  [liteKeyForQs]
);

const writeBackSnapshotNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;

  const qsStable = (listQsRef.current || "").replace(/^\?/, "");
  const qsFromUrl = window.location.search.replace(/^\?/, "");
  const qsRaw = qsStable || qsFromUrl || "";
  const nextQs = canonicalQs(qsRaw);

  // ✅ CHỐNG overwrite snapshot tốt bằng snapshot rỗng/default
  try {
    const raw = sessionStorage.getItem(HOME_BACK_SNAPSHOT_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as { ts?: number; qs?: string };
      const prevTtlOk =
        !!prev?.ts && Date.now() - prev.ts < HOME_BACK_SNAPSHOT_TTL;
      const prevQs = canonicalQs(prev?.qs || "");

      // nếu snapshot trước còn hạn + có qs, mà lần này qs rỗng => không ghi đè
      if (prevTtlOk && prevQs && !nextQs) return;
    }
  } catch {}

  const payload: BackSnapshot = {
    qs: nextQs,

    total: typeof total === "number" ? total : null,
    search,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
    statusFilter,

    pageIndex: lastPageIndexRef.current,
    displayPageIndex: lastDisplayPageIndexRef.current,
    pages: pagesRef.current,
    cursors: cursorsRef.current,
    hasNext,

    scrollTop: lastScrollTopRef.current,
    ts: Date.now(),
  };

  try {
    sessionStorage.setItem(HOME_BACK_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {}
}, [
  hasNext,
  moveFilter,
  priceApplied,
  search,
  selectedDistricts,
  selectedRoomTypes,
  sortMode,
  statusFilter,
  total,
]);

const readBackSnapshot = useCallback((): BackSnapshot | null => {
  try {
    const raw = sessionStorage.getItem(HOME_BACK_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackSnapshot;

    const ttlOk =
      !!parsed?.ts && Date.now() - parsed.ts < HOME_BACK_SNAPSHOT_TTL;
    if (!ttlOk) return null;

    return parsed;
  } catch {
    return null;
  }
}, []);

const persistNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;
  if (persistBlockedRef.current) return;
  if (homePathRef.current && pathname !== homePathRef.current) return;

  // ✅ source-of-truth: qs từ URL thật + canonical để match ổn định
  const qsRaw = window.location.search.replace(/^\?/, "");
  const qsCanonical = canonicalQs(qsRaw);
  listQsRef.current = qsCanonical;

  writeLiteNow();

  try {
    const payload: PersistState = {
      qs: qsCanonical,

      total: typeof total === "number" ? total : null,

      search,
      priceApplied,
      selectedDistricts,
      selectedRoomTypes,
      moveFilter,
      sortMode,
      statusFilter,

      pageIndex: lastPageIndexRef.current,
      displayPageIndex: lastDisplayPageIndexRef.current,
      pages: pagesRef.current,
      cursors: cursorsRef.current,
      hasNext,

      scrollTop: lastScrollTopRef.current,

      ts: Date.now(),
    };

    sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(payload));
  } catch {}
}, [
  hasNext,
  moveFilter,
  pathname,
  priceApplied,
  search,
  selectedDistricts,
  selectedRoomTypes,
  sortMode,
  statusFilter,
  total,
  writeLiteNow,
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

useEffect(() => {
  const onPageHide = () => {
  saveScrollToHistory();   // ✅ thêm
  writeBackSnapshotNow();
  persistNow();
};


const onVisibility = () => {
  if (document.visibilityState !== "hidden") return;

  saveScrollToHistory();
  writeBackSnapshotNow();
  persistNow();

  // ✅ back hint cho hydrate/back-from-detail
  try {
    const qsRaw = window.location.search.replace(/^\?/, "");
    const qsCanonical = canonicalQs(qsRaw);
    sessionStorage.setItem(
      HOME_BACK_HINT_KEY,
      JSON.stringify({ ts: Date.now(), qs: qsCanonical })
    );
  } catch {}
};

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}, [persistNow, writeBackSnapshotNow]);


const lastNavCaptureTsRef = useRef(0);
// ✅ nếu URL đang chờ update (debounce 200ms), flush ngay trước khi rời list
const flushPendingFilterUrlNow = useCallback(() => {
  const pendingQs = pendingFilterApplyQsRef.current;
  if (!pendingQs) return;

  // clear timer nếu còn
  if (filterApplyTimerRef.current) {
    window.clearTimeout(filterApplyTimerRef.current);
    filterApplyTimerRef.current = null;
  }

  pendingFilterApplyQsRef.current = null;

  // ✅ chỉ cập nhật URL + persist (KHÔNG resetPagination/fetch)
  // để tránh churn khi user sắp rời list sang detail
  replaceUrlShallow(pendingQs);
  persistSoon();
}, [persistSoon, replaceUrlShallow]);


const onNavToDetailCapture = useCallback(
  (ev: Event) => {
    // ✅ chặn double/triple fire (touchstart + pointerdown + mousedown)
    const now = Date.now();
    if (now - lastNavCaptureTsRef.current < 250) return;
    lastNavCaptureTsRef.current = now;

    // ✅ nếu là MouseEvent: chỉ nhận click chuột trái
    const me = ev as MouseEvent;
    if (typeof me.button === "number" && me.button !== 0) return;

    const target = ev.target as HTMLElement | null;
    const a = target?.closest?.("a");
    if (!a) return;

    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    // ✅ chỉ chụp snapshot khi đi sang Detail
    const isDetailNav = href.startsWith("/rooms/") || href.includes("/rooms/");
    
   if (isDetailNav) {
    // ✅ 1) flush URL pending để back về list không bị “mất filter/page”
    flushPendingFilterUrlNow();

    // ✅ 2) chốt scrollTop ngay thời điểm click (tránh stale do inertia/raf)
    const el = scrollRef.current;
    if (el) lastScrollTopRef.current = el.scrollTop;

    // ✅ 3) lưu scroll vào history state của entry hiện tại
    saveScrollToHistory();

    // ✅ 4) lưu snapshot/cache/scroll fallback
    writeBackSnapshotNow();
  }

    // hint để lần back về restore (dùng ở hydrate)
    try {
      const qsRaw = window.location.search.replace(/^\?/, "");
      const qsCanonical = canonicalQs(qsRaw);

      sessionStorage.setItem(
        HOME_BACK_HINT_KEY,
        JSON.stringify({
          ts: Date.now(),
          qs: qsCanonical, // ✅ không dùng listQsRef để tránh stale
        })
      );
    } catch {}
  },
  [flushPendingFilterUrlNow, saveScrollToHistory, writeBackSnapshotNow]
);

useEffect(() => {
  // ✅ pointerdown là chuẩn (Chrome/Edge/đa số)
  document.addEventListener("pointerdown", onNavToDetailCapture, true);

  // ✅ fallback cho Safari/iOS/webview khi pointer events không ổn định
  document.addEventListener("mousedown", onNavToDetailCapture, true);

  // ✅ touchstart passive để không ảnh hưởng scroll
  document.addEventListener("touchstart", onNavToDetailCapture, {
    capture: true,
    passive: true,
  } as AddEventListenerOptions);

  return () => {
    document.removeEventListener("pointerdown", onNavToDetailCapture, true);
    document.removeEventListener("mousedown", onNavToDetailCapture, true);
    document.removeEventListener("touchstart", onNavToDetailCapture, true as any);
  };
}, [onNavToDetailCapture]);

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

  const applyBackSnapshot = useCallback(
  (snap: BackSnapshot) => {
    // ✅ URL là source of truth: snapshot chỉ được apply nếu qs KHỚP URL hiện tại
    const currentQs = canonicalQs(window.location.search.replace(/^\?/, ""));
    const snapQs = canonicalQs(snap?.qs || "");

    if (snapQs && snapQs !== currentQs) {
      // snapshot stale / khác URL => bỏ qua hoàn toàn, không overwrite URL/state
      return false;
    }

    // chặn filter-change effect reset 1 nhịp sau restore
    persistBlockedRef.current = true;
    skipNextFilterEffectRef.current = true;

    hydratingFromUrlRef.current = true;
    try {
      // ❌ KHÔNG replaceUrlShallow từ snapshot nữa (URL phải thắng)
      // if (snap.qs) replaceUrlShallow(snap.qs);

      // ✅ chỉ restore CACHE + SCROLL (không restore FILTER/PAGE)
      // CACHE
      pagesRef.current = snap.pages ?? [];
      setPages(snap.pages ?? []);
      cursorsRef.current = snap.cursors ?? [null];
      setHasNext(Boolean(snap.hasNext));

      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);

      // ✅ PAGE không lấy từ snapshot (page phải lấy từ URL param p)
      // const pIdx = snap.pageIndex ?? 0;
      // const dIdx = snap.displayPageIndex ?? pIdx;
      // setPageIndex(pIdx);
      // setDisplayPageIndex(dIdx);

      // ✅ KHÔNG skip central fetch bằng storage nữa (data phải follow URL)
      // didRestoreFromStorageRef.current = true;

      // SCROLL (✅ defer until list render)
      if (typeof snap.scrollTop === "number") {
        pendingScrollTopRef.current = snap.scrollTop;
      }

      setTimeout(() => {
        persistBlockedRef.current = false;
      }, 400);

      setTimeout(() => {
        didApplyBackOnceRef.current = false;
      }, 0);

      endHydrationAfterTwoFrames();

      return true;
    } finally {
      queueMicrotask(() => {
        hydratingFromUrlRef.current = false;
      });
    }
  },
  [
    endHydrationAfterTwoFrames,
    replaceUrlShallow,
    setHasNext,
    setLoading,
    setShowSkeleton,
    setFetchError,
  ]
);

 // ================== HYDRATE (ONCE) ==================
useEffect(() => {
  if (didHydrateOnceRef.current) return;
  didHydrateOnceRef.current = true;
  // ✅ chặn FILTER CHANGE effect chạy ngay sau hydrate
  skipNextFilterEffectRef.current = true;
  persistBlockedRef.current = true;

  // Detect reload (F5 / pull-to-refresh)
 const navType =
  (
    performance.getEntriesByType("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined
  )?.type ?? "navigate";

isReloadRef.current = navType === "reload";

  // giữ qs list ổn định
  listQsRef.current = window.location.search.replace(/^\?/, "");

  // 1) read URL
  let url = readUrlState();

  // ✅ back-hint + back-from-detail (dùng cho toàn HYDRATE)
  let backHint: { ts?: number; qs?: string } | null = null;
  let isBackFromDetail = false;

  try {
    const raw = sessionStorage.getItem(HOME_BACK_HINT_KEY);
    if (raw) {
      const hint = JSON.parse(raw) as { ts?: number; qs?: string };
      const ttlOk = !!hint.ts && Date.now() - hint.ts < HOME_BACK_HINT_TTL;
      backHint = ttlOk ? hint : null;

      const qsOk = canonicalQs(hint.qs || "") === canonicalQs(url.qs || "");
      if (ttlOk && qsOk) isBackFromDetail = true;
    }
  } catch {}

  // ✅ nếu back từ detail mà Home URL đang rỗng query -> sync lại từ backHint trước khi match/restore
  if ((!url.qs || url.qs.length === 0) && backHint?.qs) {
    replaceUrlShallow(backHint.qs);
    url = readUrlState();

    try {
      const qsOk =
        canonicalQs(backHint.qs || "") === canonicalQs(url.qs || "");
      if (qsOk) isBackFromDetail = true;
    } catch {}
  }

  // helper: kết thúc hydrate an toàn (2 RAF + mở persist trễ)
  function finishHydrate() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          persistBlockedRef.current = false;
        }, 400);

        endHydrationAfterTwoFrames();
         // ✅ quan trọng: chỉ coi "reload" đúng cho lần mount đầu tiên
      isReloadRef.current = false;
      });
    });
  }

  // ✅ BACK SNAPSHOT restore (khôi phục cấu trúc logic cũ)
// ưu tiên trước V2/Lite/URL; chỉ áp dụng khi KHÔNG reload
if (!isReloadRef.current && !didApplyBackOnceRef.current) {
  // ✅ nếu admin vừa thay đổi media => BỎ restore snapshot, ép fetch lại
  let forceRefresh = false;
  try {
    forceRefresh = Boolean(sessionStorage.getItem("HOME_FORCE_REFRESH_V1"));
    if (forceRefresh) {
      sessionStorage.removeItem("HOME_FORCE_REFRESH_V1");
      sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
      sessionStorage.removeItem(HOME_STATE_KEY);

      // clear all HOME_STATE_LITE_V1::*
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i) || "";
        if (k.startsWith(HOME_STATE_LITE_PREFIX)) sessionStorage.removeItem(k);
      }
    }
  } catch {}

  if (!forceRefresh) {
    const snap = readBackSnapshot();
    if (snap) {
      didApplyBackOnceRef.current = true; // ✅ chặn restore trùng

      // ✅ URL = source of truth: hydrate FILTER/PAGE từ URL trước khi apply cache/scroll
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

      const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
      setPageIndex(pIdx);
      setDisplayPageIndex(pIdx);

      // ✅ cursor đang đứng theo URL (nếu có)
      if (url.c != null) {
        cursorsRef.current[pIdx] = url.c;
      }

      // ✅ apply cache + scroll (snapshot) — không overwrite URL/filter/page
      applyBackSnapshot(snap);

      // ✅ nếu page chưa có cache thật (undefined) thì fetch theo URL
      queueMicrotask(() => {
        fetchPageRef.current(pIdx);
      });

      try {
        sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
      } catch {}

      finishHydrate();
      return;
    }

  }
} 

// ✅ RELOAD: vẫn tuân theo URL (KHÔNG tự clear URL về "/")
if (isReloadRef.current) {
  hydratingFromUrlRef.current = true;
  try {
    // drop mọi response cũ (nếu có request đang bay)
    filtersVersionRef.current += 1;

    // purge persisted state (để tránh restore stale)
    try { sessionStorage.removeItem(HOME_STATE_KEY); } catch {}
    try { sessionStorage.removeItem(HOME_BACK_HINT_KEY); } catch {}
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("HOME_STATE_LITE_V1::")) sessionStorage.removeItem(k);
      }
    } catch {}

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

    // ✅ fetch đúng page theo URL
    queueMicrotask(() => {
      fetchPageRef.current(pIdx);
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

  const ttlOk = restored?.ts
    ? Date.now() - restored.ts < 30 * 60 * 1000
    : false;

  const match =
    !!restored &&
    ttlOk &&
    canonicalQs(restored.qs || "") === canonicalQs(url.qs || "");

   // ------------------ RESTORE FROM STORAGE ------------------
  if (match && restored) {
    const rest = restored;

    hydratingFromUrlRef.current = true;
    try {
      // ✅ URL = source of truth:
      // FILTER luôn lấy từ URL (không lấy từ storage nữa)
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

      // ✅ total có thể lấy từ storage (chỉ là số hiển thị)
      setTotal(typeof rest.total === "number" ? rest.total : null);

      // ✅ PAGE luôn lấy từ URL
      const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
      setPageIndex(pIdx);
      setDisplayPageIndex(pIdx);

      // ✅ storage chỉ restore CACHE để back/load nhanh
      pagesRef.current = rest.pages ?? [];
      setPages(rest.pages ?? []);

      cursorsRef.current = rest.cursors ?? [null];
      setHasNext(Boolean(rest.hasNext));

      // ✅ cursor đang đứng phải theo URL (nếu URL có c)
      if (url.c != null) {
        cursorsRef.current[pIdx] = url.c;
      }

      // ✅ scroll: chỉ là UI concern
      if (typeof rest.scrollTop === "number") {
        pendingScrollTopRef.current = rest.scrollTop;
      }

      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);

      try {
        sessionStorage.removeItem(HOME_BACK_HINT_KEY);
      } catch {}

      finishHydrate();
      return;
    } finally {
      queueMicrotask(() => {
        hydratingFromUrlRef.current = false;
      });
    }
  }

    // ------------------ RESTORE FROM LITE (fallback) ------------------
  const effectiveQs = url.qs || backHint?.qs || "";
  const lite = readLiteForQs(effectiveQs);

  if (lite) {
    hydratingFromUrlRef.current = true;
    try {
      // ✅ URL = source of truth: FILTER/PAGE lấy từ URL, KHÔNG lấy từ lite
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

      // ✅ total/hasNext/scrollTop chỉ là “hint UI”, được phép dùng lite
      setTotal(typeof lite.total === "number" ? lite.total : null);
      setHasNext(Boolean(lite.hasNext));

      // ✅ PAGE theo URL
      const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
      filtersVersionRef.current += 1;

      // reset cache theo page từ URL
      resetPagination(pIdx);

      // ✅ cursor theo URL (nếu có)
      cursorsRef.current[pIdx] = url.c ?? null;

      setFetchError("");
      setLoading(false);
      setShowSkeleton(true);

      // ✅ scroll fallback (history.state ưu tiên; cái này chỉ set pending)
      if (typeof lite.scrollTop === "number") {
        pendingScrollTopRef.current = lite.scrollTop;
      }

      try {
        sessionStorage.removeItem(HOME_BACK_HINT_KEY);
      } catch {}

      // ✅ fetch đúng page theo URL (đừng chờ pageIndex effect vì pageIndex có thể không đổi)
      queueMicrotask(() => {
        fetchPageRef.current(pIdx);
      });

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

// ================== PAGESHOW (bfcache/back) ==================
useEffect(() => {
  const onPageShow = (ev: PageTransitionEvent) => {
    // chỉ khi BFCache restore (mobile swipe-back)
    if (!ev.persisted) return;

    // tránh apply 2 lần (pageshow + popstate)
    if (didApplyBackOnceRef.current) return;
    didApplyBackOnceRef.current = true;

    const snap = readBackSnapshot();
    if (!snap) return;

    // ✅ URL = source of truth: hydrate FILTER/PAGE từ URL
    const url = readUrlState();

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

    const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;
    setPageIndex(pIdx);
    setDisplayPageIndex(pIdx);

    if (url.c != null) {
      cursorsRef.current[pIdx] = url.c;
    }

    applyBackSnapshot(snap);

    // ✅ đảm bảo page đúng theo URL được fetch nếu cache thiếu
    queueMicrotask(() => {
      fetchPageRef.current(pIdx);
    });

    try {
      sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
    } catch {}
  };

  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.removeEventListener("pageshow", onPageShow);
    // reset guard khi rời trang (để lần sau back vẫn chạy)
    didApplyBackOnceRef.current = false;
  };
}, [applyBackSnapshot, readBackSnapshot, readUrlState]);

  // ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const onPop = () => {
  if (didApplyBackOnceRef.current) return;
  didApplyBackOnceRef.current = true;

  const finishPop = () => {
    // ✅ mở persist trễ + reset guard để lần pop sau vẫn chạy
    setTimeout(() => {
      persistBlockedRef.current = false;
      didApplyBackOnceRef.current = false;
    }, 400);
  };

  persistBlockedRef.current = true;
  skipNextFilterEffectRef.current = true;

  const url = readUrlState();


// ✅ ưu tiên history scroll (ổn định nhất), snapshot/storage chỉ là fallback
const restoredByHistory = restoreScrollFromHistory();

  // 1) ưu tiên restore từ sessionStorage
    let restored: PersistState | null = null;
    try {
      const raw = sessionStorage.getItem(HOME_STATE_KEY);
      if (raw) restored = JSON.parse(raw) as PersistState;
    } catch {
      restored = null;
    }

    const ttlOk = restored?.ts ? Date.now() - restored.ts < 30 * 60 * 1000 : false;
    
    const match =
      !!restored &&
      ttlOk &&
      canonicalQs(restored.qs || "") === canonicalQs(url.qs || "");

    if (match && restored) {
    const rest = restored;

    hydratingFromUrlRef.current = true;
    try {
      // ✅ URL = source of truth:
      // POPSTATE luôn hydrate FILTER/PAGE từ URL, không từ storage nữa
      setSearch(url.q);
      setPriceDraft([url.minVal, url.maxVal]);
      setPriceApplied([url.minVal, url.maxVal]);
      setSelectedDistricts(url.d);
      setSelectedRoomTypes(url.t);
      setMoveFilter(url.m);
      setSortMode(url.s);
      setTotal(typeof rest.total === "number" ? rest.total : null);
      setStatusFilter(isReloadRef.current ? null : url.st);

      // ✅ storage chỉ restore CACHE (để back nhanh)
      pagesRef.current = rest.pages ?? [];
      setPages(rest.pages ?? []);

      cursorsRef.current = rest.cursors ?? [null];
      setHasNext(Boolean(rest.hasNext));

      // ✅ PAGE cũng lấy từ URL
      const pIdx = url.nextPage ?? 0;
      setPageIndex(pIdx);
      setDisplayPageIndex(pIdx);

      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);

      // ✅ nếu history chưa có scroll thì fallback dùng scrollTop từ storage
      if (!restoredByHistory && typeof rest.scrollTop === "number") {
        pendingScrollTopRef.current = rest.scrollTop;
      }

      finishPop();
      endHydrationAfterTwoFrames();

      // ✅ nếu page chưa có cache thật (undefined) thì fetch theo URL
      queueMicrotask(() => {
        fetchPageRef.current(pIdx);
      });

      return;

    } finally {

      queueMicrotask(() => {
        hydratingFromUrlRef.current = false;
      });
    }
  }

// ------------------ RESTORE FROM LITE (fallback) ------------------
const effectiveQs = url.qs || "";
const lite = readLiteForQs(effectiveQs);

if (lite) {
  hydratingFromUrlRef.current = true;
  try {
    // ✅ URL = source of truth: FILTER/PAGE lấy từ URL, KHÔNG lấy từ lite
    setSearch(url.q);
    setPriceDraft([url.minVal, url.maxVal]);
    setPriceApplied([url.minVal, url.maxVal]);
    setSelectedDistricts(url.d);
    setSelectedRoomTypes(url.t);
    setMoveFilter(url.m);
    setSortMode(url.s);
    setStatusFilter(isReloadRef.current ? null : url.st);

    // ✅ hint UI từ lite
    setTotal(typeof lite.total === "number" ? lite.total : null);
    setHasNext(Boolean(lite.hasNext));

    const pIdx = Number.isFinite(url.nextPage) ? url.nextPage : 0;

    filtersVersionRef.current += 1;
    resetPagination(pIdx);

    // ✅ cursor theo URL (nếu có)
    cursorsRef.current[pIdx] = url.c ?? null;

    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);

    // ✅ nếu history chưa có scroll thì fallback dùng scrollTop từ lite
    if (!restoredByHistory && typeof lite.scrollTop === "number") {
      pendingScrollTopRef.current = lite.scrollTop;
    }

       finishPop();
    endHydrationAfterTwoFrames();

      // ✅ nếu page chưa có cache thật (undefined) thì fetch theo URL
      queueMicrotask(() => {
        fetchPageRef.current(pIdx);
      });

      return;

    } finally {

    queueMicrotask(() => {
      hydratingFromUrlRef.current = false;
    });
  }
}
//---------------------------------------
 // fallback: hydrate theo URL + fetch
  hydratingFromUrlRef.current = true;

  setSearch(url.q);
  setPriceDraft([url.minVal, url.maxVal]);
  setPriceApplied([url.minVal, url.maxVal]);
  setSelectedDistricts(url.d);
  setSelectedRoomTypes(url.t);
  setMoveFilter(url.m);
  setSortMode(url.s);
  setStatusFilter(isReloadRef.current? null : url.st);

  filtersVersionRef.current += 1;
  resetPagination(url.nextPage);
  // ✅ popstate: cursor từ URL là cursor dùng để fetch page đó
  cursorsRef.current[url.nextPage] = url.c ?? null;

  queueMicrotask(() => {
    hydratingFromUrlRef.current = false;
  });

    // pageIndex có thể không đổi -> fetch trực tiếp
    fetchPageRef.current(url.nextPage);

        requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        finishPop();
        endHydrationAfterTwoFrames();
      });
    });
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
 }, [readUrlState, resetPagination, endHydrationAfterTwoFrames, readLiteForQs]);

  // ================== FETCH PAGE ==================
  const fetchPage = useCallback(
  async (targetIndex: number) => {
    const myVersion = filtersVersionRef.current;

    // 🔎 DEBUG
    console.log("[fetchPage] enter", {
      targetIndex,
      myVersion,
      pageIndex: pageIndexRef.current,
      cachedIsUndef: pagesRef.current[targetIndex] === undefined,
      cachedType: typeof pagesRef.current[targetIndex],
      cachedLen: Array.isArray(pagesRef.current[targetIndex])
        ? pagesRef.current[targetIndex]?.length
        : null,
      lastFilterSig: lastFilterSigRef.current,
      hydrating: hydratingFromUrlRef.current,
    });

    if (pagesRef.current[targetIndex] !== undefined) {
      console.log("[fetchPage] skip: cached page exists", { targetIndex });
      setShowSkeleton(false);
      return;
    }

    const reqKey = `${lastFilterSigRef.current ?? ""}::${targetIndex}`;

    if (inFlightRef.current[reqKey]) {
      console.log("[fetchPage] skip: inFlight", { reqKey });
      return;
    }

    inFlightRef.current[reqKey] = true;
    console.log("[fetchPage] start request", { reqKey });

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
    }, [fetchPage]);

    // ================== APPLY PENDING SCROLL (after render) ==================
useEffect(() => {
  const st = pendingScrollTopRef.current;
  if (st == null) return;

  const el = scrollRef.current;
  if (!el) return;

  // chờ layout ổn định (list render xong + skeleton tắt)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollTop = st;
      lastScrollTopRef.current = st;
      pendingScrollTopRef.current = null;
    });
  });
}, [
  displayPageIndex,
  roomsToRender.length,
  loading,
  showSkeleton,
]);


  // ================== CENTRAL FETCH ==================
  useEffect(() => {
  // ✅ skip 1 vòng ngay sau hydrate restore
  if (didRestoreFromStorageRef.current) {
    didRestoreFromStorageRef.current = false;
    setShowSkeleton(false);
    setDisplayPageIndex(pageIndex);
    return;
  }

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
        lastScrollTopRef.current = el.scrollTop;

        // ✅ update history scroll (throttle theo raf)
        saveScrollToHistory();

        persistSoon();
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
}, [persistSoon, saveScrollToHistory]);

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
  
  // ngay đầu useEffect FILTER CHANGE
console.log("FILTER_CHANGE", {
  skip: skipNextFilterEffectRef.current,
  hydrating: hydratingFromUrlRef.current,
  filterSig,
  last: lastFilterSigRef.current,
  moveFilter,
});

  const applied = appliedSearch.trim();

  // ✅ nếu vừa hydrate (initial/popstate/restore) thì bỏ qua 1 nhịp FILTER CHANGE
 if (skipNextFilterEffectRef.current) {
  skipNextFilterEffectRef.current = false;

  lastFilterSigRef.current = filterSig;
  prevAppliedSearchRef.current = appliedSearch.trim();
  return;
 }
   if (hydratingFromUrlRef.current) {
  lastFilterSigRef.current = filterSig;
  prevAppliedSearchRef.current = appliedSearch.trim();
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

    persistSoon();
    return;
  }

    // ====== Normal filter change flow (URL cập nhật NGAY, fetch debounce) ======
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

  // ✅ URL đổi NGAY để không bao giờ bị “click detail nhanh -> back mất filter/page”
  replaceUrlShallow(qs);

  if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);

  filterApplyTimerRef.current = window.setTimeout(() => {
    filterApplyTimerRef.current = null;

    setTotal(null);
    setDisplayPageIndex(0);
    resetPagination(0);
    fetchPage(0);
    persistSoon();
  }, 200);

  return () => {
    if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);
    filterApplyTimerRef.current = null;
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
