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
  pet: "pet",
term: "term",
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
let didConsumeDocumentReload = false;

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

function makeFilterSigValue(args: {
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  sortMode: SortMode;
  statusFilter: string | null;
}) {
  return [
    args.search.trim(),
    args.priceApplied[0],
    args.priceApplied[1],
    args.selectedDistricts.join(","),
    args.selectedRoomTypes.join(","),
    args.moveFilter ?? "",
    args.petFilters.join(","),
    args.termFilters.join(","),
    args.sortMode,
    args.statusFilter ?? "",
  ].join("|");
}

const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 15 * 60 * 1000; // 15 phút

// ✅ BACK SNAPSHOT (cấu trúc logic cũ để giữ page/scroll khi back từ detail)
const HOME_BACK_SNAPSHOT_KEY = "HOME_BACK_SNAPSHOT_V1";
const HOME_BACK_SNAPSHOT_TTL = 15 * 60 * 1000;

const HOME_STATE_KEY = "HOME_STATE_V2"; // giữ nguyên
const HOME_STATE_LITE_PREFIX = "HOME_STATE_LITE_V1::"; // ✅ per-qS key
const HOME_STATE_LITE_TTL = 30 * 60 * 1000; // 30 phút (đồng bộ V2)
// ✅ nếu có thay đổi dữ liệu quan trọng từ tab khác (/admin) thì Home bỏ restore cache cũ
const HOME_DIRTY_KEY = "HOME_DIRTY_V1";

type BackSnapshot = {
  qs: string;

  // ✅ filters
  total: number | null;
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
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
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
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
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  sortMode: SortMode;
  statusFilter: string | null;

  // minimal pagination + scroll
  pageIndex: number;
  displayPageIndex: number;
  hasNext: boolean;
  scrollTop: number;
  currentCursor: UrlCursor;

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
  const replaceStateLastTsRef = useRef(0);
  const replaceStateTimerRef = useRef<number | null>(null);

 

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
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);
  const [petFilters, setPetFilters] = useState<("cat" | "dog" | "nopet")[]>([]);
const [termFilters, setTermFilters] = useState<("short" | "long")[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const lastFilterSigRef = useRef<string>("");
  const prevAppliedSearchRef = useRef<string>("");
  const pendingRestoredFilterSigRef = useRef<string | null>(null);

 const armRestoredFilterSig = useCallback((next: {
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  sortMode: SortMode;
  statusFilter: string | null;
}) => {
  const sig = makeFilterSigValue(next);
  pendingRestoredFilterSigRef.current = sig;
  lastFilterSigRef.current = sig;
  prevAppliedSearchRef.current = next.search.trim();
}, []);

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
    petFilters.join(","),
    termFilters.join(","),
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
  petFilters,
  termFilters,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  pets: ("cat" | "dog" | "nopet")[];
  terms: ("short" | "long")[];
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

  const DIRTY_SEEN_KEY = "HOME_DIRTY_SEEN_V1";

  const clearHomeCaches = () => {
    try {
      // các key Home đang dùng
      sessionStorage.removeItem(HOME_STATE_KEY);
      sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
      sessionStorage.removeItem(HOME_BACK_HINT_KEY);

      // xoá toàn bộ lite cache theo qs
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i) || "";
        if (k.startsWith(HOME_STATE_LITE_PREFIX)) sessionStorage.removeItem(k);
      }
    } catch {}
  };

  const applyDirtyStamp = (stamp: string) => {
  try {
    const seen = sessionStorage.getItem(DIRTY_SEEN_KEY) || "";
    if (!stamp || stamp === seen) return;

    clearHomeCaches();
    sessionStorage.setItem(DIRTY_SEEN_KEY, stamp);

    // ✅ FORCE REFRESH (client fetch), không dùng SSR cache nữa
    filtersVersionRef.current += 1;     // drop mọi response cũ
    resetPagination(0);                // pagesRef[0] => undefined
    setTotal(null);

    // scroll top (optional nhưng hợp lý)
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });

    // ✅ fetch lại page 0
    queueMicrotask(() => {
      fetchPageRef.current(0);
    });
  } catch {}

};
  // ✅ 1) same-tab dirty (đã có sẵn)
  try {
  const dirty = sessionStorage.getItem(HOME_DIRTY_KEY);
if (dirty) {
  sessionStorage.removeItem(HOME_DIRTY_KEY);
  applyDirtyStamp(dirty); // ✅ dùng chung 1 path
}
} catch {}

  // ✅ 2) cross-tab dirty (localStorage)
  try {
    const stamp = localStorage.getItem(HOME_DIRTY_KEY) || "";
    if (stamp) applyDirtyStamp(stamp);
  } catch {}

  // ✅ 3) nghe storage event để Home tab tự clear ngay khi admin tab save
  const onStorage = (e: StorageEvent) => {
    if (e.key !== HOME_DIRTY_KEY) return;
    const stamp = String(e.newValue || "");
    if (!stamp) return;
    applyDirtyStamp(stamp);
  };

  window.addEventListener("storage", onStorage);

  // lưu qs hiện tại của Home ngay lúc mount
  listQsRef.current = window.location.search.replace(/^\?/, "");

  return () => {
    window.removeEventListener("storage", onStorage);
  };
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

   // Safari iOS giới hạn replaceState (100 lần / 30s).
  // Nếu thao tác nhanh sẽ throw SecurityError => crash app.
  const now = Date.now();
  const MIN_INTERVAL_MS = 600;

  const doReplace = () => {
    replaceStateLastTsRef.current = Date.now();
    try {
      history.replaceState(next, "", window.location.href);
    } catch {
      // bỏ qua nếu Safari đang khóa history tạm thời
    }
  };

  // Nếu gọi quá dày, gộp lại thành 1 lần
  if (now - replaceStateLastTsRef.current < MIN_INTERVAL_MS) {
    if (replaceStateTimerRef.current) return;

    replaceStateTimerRef.current = window.setTimeout(() => {
      replaceStateTimerRef.current = null;
      doReplace();
    }, MIN_INTERVAL_MS);

    return;
  }

  doReplace();

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
    pet?: ("cat" | "dog" | "nopet")[];
    term?: ("short" | "long")[];
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
    setOrDel(QS.pet, next.pet?.length ? toListParam(next.pet) : null);
    setOrDel(QS.term, next.term?.length ? toListParam(next.term) : null);
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

// ================== DEBUG OVERLAY (Patch D1) ==================
type DebugWrite = {
  okAt?: number;
  errAt?: number;
  errName?: string;
  errMsg?: string;
  key?: string;
  bytes?: number;
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function approxBytes(str: string) {
  // rough UTF-8-ish estimate
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(str).length : str.length * 2;
}


const replaceUrlShallow = useCallback(
  (nextQs: string) => {
    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return;

    const url = nextQs ? `${pathname}?${nextQs}` : pathname;

    // ✅ chỉ cập nhật URL của entry hiện tại, không trigger route navigation của Next
    window.history.replaceState(window.history.state, "", url);

    // ✅ luôn giữ qs ổn định của Home list
    listQsRef.current = nextQs;
  },
  [pathname]
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
    pet: petFilters,
    term: termFilters,
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
  petFilters,
  termFilters,
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

  const pet = parseList(sp.get(QS.pet)).filter(
    (v): v is "cat" | "dog" | "nopet" =>
      v === "cat" || v === "dog" || v === "nopet"
  );

  const term = parseList(sp.get(QS.term)).filter(
    (v): v is "short" | "long" =>
      v === "short" || v === "long"
  );

  const normalizedTerm: ("short" | "long")[] = term;

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

  return {
    qs,
    q,
    minVal,
    maxVal,
    d,
    t,
    m,
    pet,
    term: normalizedTerm,
    s,
    st,
    nextPage,
    c,
  };
}, []);

// ================== DEBUG OVERLAY (Patch D1) ==================
const debugEnabled = useMemo(() => {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get("debug") === "1";
}, []);

const debugLastWriteRef = useRef<DebugWrite>({});
const debugOverlayElRef = useRef<HTMLDivElement | null>(null);
const debugAppliedBackHintRef = useRef<{ at?: number; qs?: string }>({});

const debugSetItem = useCallback((key: string, value: string) => {
  // always swallow (like current code), but record what happened
  try {
    sessionStorage.setItem(key, value);
    debugLastWriteRef.current = {
      okAt: Date.now(),
      key,
      bytes: approxBytes(value),
    };
    return true;
  } catch (e: any) {
    debugLastWriteRef.current = {
      errAt: Date.now(),
      errName: e?.name ? String(e.name) : "Error",
      errMsg: e?.message ? String(e.message) : String(e),
      key,
      bytes: approxBytes(value),
    };
    return false;
  }
}, []);

useEffect(() => {
  if (!debugEnabled) return;

  // create overlay
  const el = document.createElement("div");
  el.id = "home-debug-overlay";
  el.style.position = "fixed";
  el.style.left = "8px";
  el.style.right = "8px";
  el.style.bottom = "8px";
  el.style.zIndex = "2147483647";
  el.style.background = "rgba(0,0,0,0.80)";
  el.style.color = "white";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "10px";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.35";
  el.style.whiteSpace = "pre-wrap";
  el.style.wordBreak = "break-word";
  el.style.pointerEvents = "auto";
  el.style.userSelect = "text";
  el.textContent = "HOME DEBUG (starting...)";
  document.body.appendChild(el);
  debugOverlayElRef.current = el;

  const render = () => {
    if (!debugOverlayElRef.current) return;

    // read current keys (best-effort)
    const homeStateRaw = (() => { try { return sessionStorage.getItem(HOME_STATE_KEY); } catch { return null; } })();
    const backSnapRaw  = (() => { try { return sessionStorage.getItem(HOME_BACK_SNAPSHOT_KEY); } catch { return null; } })();
    const backHintRaw  = (() => { try { return sessionStorage.getItem(HOME_BACK_HINT_KEY); } catch { return null; } })();

    const homeState = safeJsonParse<{ ts?: number; qs?: string }>(homeStateRaw);
    const backSnap  = safeJsonParse<{ ts?: number; qs?: string }>(backSnapRaw);
    const backHint  = safeJsonParse<{ ts?: number; qs?: string }>(backHintRaw);

    const now = Date.now();
    const fmtAge = (ts?: number) => (ts ? `${Math.max(0, Math.round((now - ts) / 1000))}s ago` : "n/a");

    const last = debugLastWriteRef.current;
    const applied = debugAppliedBackHintRef.current;
    const appliedAge = applied.at ? `${Math.max(0, Math.round((now - applied.at) / 1000))}s ago` : "n/a";

   const lines = [
  `HOME DEBUG (debug=1)`,
  `URL: ${window.location.pathname}${window.location.search}`,
  `AppliedBackHintUrl: ${applied.at ? "YES" : "NO"}  age=${appliedAge}`,
  applied.qs ? `RestoredQs: ${applied.qs}` : `RestoredQs: (none)`,
  ``,
  `Last write:`,
      last.okAt ? `  OK   ${fmtAge(last.okAt)}  key=${last.key}  bytes=${last.bytes}` : `  OK   n/a`,
      last.errAt ? `  ERR  ${fmtAge(last.errAt)}  ${last.errName}: ${last.errMsg}  key=${last.key}  bytes=${last.bytes}` : `  ERR  none`,
      ``,
      `sessionStorage keys (exists / bytes / age):`,
      `  HOME_STATE_V2: ${homeStateRaw ? "YES" : "NO"}  bytes=${homeStateRaw ? approxBytes(homeStateRaw) : 0}  age=${fmtAge(homeState?.ts)}`,
      `  HOME_BACK_SNAPSHOT_V1: ${backSnapRaw ? "YES" : "NO"}  bytes=${backSnapRaw ? approxBytes(backSnapRaw) : 0}  age=${fmtAge(backSnap?.ts)}`,
      `  HOME_BACK_HINT_V1: ${backHintRaw ? "YES" : "NO"}  bytes=${backHintRaw ? approxBytes(backHintRaw) : 0}  age=${fmtAge(backHint?.ts)}`,
      ``,
      `Tip: nếu thấy ERR = QuotaExceededError / SecurityError / null keys sau khi treo tab -> đúng hướng lỗi.`,
    ];

    debugOverlayElRef.current.textContent = lines.join("\n");
  };

  render();
  const t = window.setInterval(render, 800);

  return () => {
    window.clearInterval(t);
    try { document.body.removeChild(el); } catch {}
    debugOverlayElRef.current = null;
  };
}, [debugEnabled]);

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

const payload: PersistLiteState = {
  qs,
  total: typeof total === "number" ? total : null,

  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,
  sortMode,
  statusFilter,

  pageIndex: lastPageIndexRef.current,
  displayPageIndex: lastDisplayPageIndexRef.current,
  hasNext,
  scrollTop: lastScrollTopRef.current,
  currentCursor: (cursorsRef.current[lastPageIndexRef.current] ?? null) as UrlCursor,
  ts: Date.now(),
};
 const k = liteKeyForQs(qsRaw);
const v = JSON.stringify(payload);
debugSetItem(k, v);

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

  const payload: BackSnapshot = {
  qs: nextQs,

  total: typeof total === "number" ? total : null,
  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,
  sortMode,
  statusFilter,

  pageIndex,
  displayPageIndex,
  pages: pagesRef.current,
  cursors: cursorsRef.current,
  hasNext,

  scrollTop: scrollRef.current?.scrollTop ?? lastScrollTopRef.current,
  ts: Date.now(),
};

  debugSetItem(HOME_BACK_SNAPSHOT_KEY, JSON.stringify(payload));
}, [
  displayPageIndex,
  hasNext,
  moveFilter,
  petFilters,
  termFilters,
  pageIndex,
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

const payload: PersistState = {
  qs: qsCanonical,
  total: typeof total === "number" ? total : null,

  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,
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

debugSetItem(HOME_STATE_KEY, JSON.stringify(payload));

}, [
  hasNext,
  moveFilter,
  petFilters,
  termFilters,
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
  const qsRaw = window.location.search.replace(/^\?/, "");
const qsCanonical = canonicalQs(qsRaw);
debugSetItem(HOME_BACK_HINT_KEY, JSON.stringify({ ts: Date.now(), qs: qsCanonical }));

};

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
        if (replaceStateTimerRef.current) {
      clearTimeout(replaceStateTimerRef.current);
      replaceStateTimerRef.current = null;
    }
  };
}, [persistNow, writeBackSnapshotNow]);


const lastNavCaptureTsRef = useRef(0);

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
    // ✅ chốt scrollTop ngay thời điểm click (tránh stale do inertia/raf)
    const el = scrollRef.current;
    if (el) lastScrollTopRef.current = el.scrollTop;

    // ✅ lưu scroll vào history state của entry hiện tại (để popstate restore ổn định)
    saveScrollToHistory();

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
  [persistNow, writeLiteNow, writeBackSnapshotNow]
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
  inFlightRef.current = {};

  const nextPages: any[][] = new Array(keepPage + 1);
  pagesRef.current = nextPages;
  setPages(nextPages);

  setPageIndex(keepPage);
  setDisplayPageIndex(keepPage);

  cursorsRef.current = [null];
  setHasNext(true);
  setFetchError("");
  setLoading(false);

  // chỉ reset trạng thái, chưa quyết định hiện skeleton hay không ở đây
  setShowSkeleton(false);
  setIsRefreshing(false);
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


  const applyBackSnapshot = useCallback(
  (snap: BackSnapshot) => {
    // chặn filter-change effect reset 1 nhịp sau restore
    persistBlockedRef.current = true;
    skipNextFilterEffectRef.current = true;

    hydratingFromUrlRef.current = true;
    try {
      if (snap.qs) replaceUrlShallow(snap.qs);

      // ================== FILTER ==================
    setSearch(snap.search ?? "");
    setPriceDraft(snap.priceApplied ?? PRICE_DEFAULT);
    setPriceApplied(snap.priceApplied ?? PRICE_DEFAULT);
    setSelectedDistricts(snap.selectedDistricts ?? []);
    setSelectedRoomTypes(snap.selectedRoomTypes ?? []);
    setMoveFilter(snap.moveFilter ?? null);
    setPetFilters(snap.petFilters ?? []);
    setTermFilters(snap.termFilters ?? ["long"]);
    setSortMode(snap.sortMode ?? "updated_desc");
    setTotal(typeof snap.total === "number" ? snap.total : null);
    setStatusFilter(snap.statusFilter ?? null);

      armRestoredFilterSig({
      search: snap.search ?? "",
      priceApplied: snap.priceApplied ?? PRICE_DEFAULT,
      selectedDistricts: snap.selectedDistricts ?? [],
      selectedRoomTypes: snap.selectedRoomTypes ?? [],
      moveFilter: snap.moveFilter ?? null,
      petFilters: snap.petFilters ?? [],
      termFilters: snap.termFilters ?? ["long"],
      sortMode: snap.sortMode ?? "updated_desc",
      statusFilter: snap.statusFilter ?? null,
    });

      // ================== CACHE ==================
      pagesRef.current = snap.pages ?? [];
      setPages(snap.pages ?? []);
      cursorsRef.current = snap.cursors ?? [null];
      setHasNext(Boolean(snap.hasNext));

      setFetchError("");
      setLoading(false);
      setShowSkeleton(false);

      // ================== PAGE ==================
      const pIdx = snap.pageIndex ?? 0;
      const dIdx = snap.displayPageIndex ?? pIdx;
      setPageIndex(pIdx);
      setDisplayPageIndex(dIdx);

      // CENTRAL FETCH skip 1 vòng
      didRestoreFromStorageRef.current = true;

      // ================== SCROLL ==================
      if (typeof snap.scrollTop === "number") {
        pendingScrollTopRef.current = snap.scrollTop;
      }

      // mở lại persist sau 1 nhịp
     persistBlockedRef.current = false;

      // reset guard để lần back sau vẫn hoạt động
      setTimeout(() => {
        didApplyBackOnceRef.current = false;
      }, 0);

      endHydrationAfterTwoFrames();
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

// ✅ chỉ coi là reload ở lần mount Home đầu tiên của document hiện tại
isReloadRef.current = !didConsumeDocumentReload && navType === "reload";
didConsumeDocumentReload = true;

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

  // ✅ nếu back từ detail mà Home URL đang rỗng query -> dùng backHint làm nguồn sự thật ngay
if ((!url.qs || url.qs.length === 0) && backHint?.qs) {
  isBackFromDetail = true;
  replaceUrlShallow(backHint.qs);

  // dùng luôn qs của hint cho lượt hydrate này,
  // không phụ thuộc việc router/readUrlState có cập nhật kịp ngay hay không
  url = {
    ...readUrlState(),
    qs: backHint.qs,
  };
}

  // helper: kết thúc hydrate an toàn (2 RAF + mở persist trễ)
  function finishHydrate() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // ✅ mở persist sớm hơn để user thao tác ngay sau reload không bị nuốt
      persistBlockedRef.current = false;

      endHydrationAfterTwoFrames();

      // ✅ chỉ coi "reload" đúng cho lần mount đầu tiên
      isReloadRef.current = false;
    });
  });
}
  
   // ✅ Home mặc định "/" => KHÔNG restore cache cũ và KHÔNG tin tuyệt đối SSR list
// Nếu initialRooms bị stale thì ép client fetch lại page 0
if ((!url.qs || url.qs.length === 0) && !isBackFromDetail && !backHint?.qs) {
  hydratingFromUrlRef.current = true;

  try {
    sessionStorage.removeItem(HOME_BACK_HINT_KEY);
  } catch {}

  setSearch("");
  setPriceDraft(PRICE_DEFAULT);
  setPriceApplied(PRICE_DEFAULT);
  setSelectedDistricts([]);
  setSelectedRoomTypes([]);
  setMoveFilter(null);
  setSortMode("updated_desc");
  setStatusFilter(null);

  pagesRef.current = [];
  setPages([]);

  cursorsRef.current = [null];
  setHasNext(true);

  setPageIndex(0);
  setDisplayPageIndex(0);

  setFetchError("");
  setLoading(false);
  setShowSkeleton(true);
  setTotal(null);

  // ❌ không force clean URL ở đây nữa
  // vì nếu flow back/hydrate bị lệch nhịp, dòng này sẽ kéo URL filtered về "/"

  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    lastScrollTopRef.current = 0;
  });

  queueMicrotask(() => {
    fetchPageRef.current(0);
  });

  finishHydrate();
  return;
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
      applyBackSnapshot(snap);

      try {
        sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
      } catch {}

      return;
    }
  }
} 

// ✅ HARD RESET when reload (F5 / pull-to-refresh)
// => quay về đúng trạng thái như lúc mở web lần đầu
if (isReloadRef.current) {
  hydratingFromUrlRef.current = true;

  try {
    filtersVersionRef.current += 1;

     // ✅ reload là một phiên Home mới
    // xóa back-hint cũ để tránh hydrate sau đó hiểu nhầm là back từ detail
    try {
      sessionStorage.removeItem(HOME_BACK_HINT_KEY);
    } catch {}

    setSearch("");
    setPriceDraft(PRICE_DEFAULT);
    setPriceApplied(PRICE_DEFAULT);
    setSelectedDistricts([]);
    setSelectedRoomTypes([]);
    setMoveFilter(null);
    setSortMode("updated_desc");
    setStatusFilter(null);
    setTotal(null);

    const defaultSig = [
      "",
      PRICE_DEFAULT[0],
      PRICE_DEFAULT[1],
      "",
      "",
      "",
      "updated_desc",
      "",
    ].join("|");

    lastFilterSigRef.current = defaultSig;
    prevAppliedSearchRef.current = "";
    skipNextFilterEffectRef.current = true;

    // reset pagination + list UI
    pagesRef.current = [];
    setPages([]);

    cursorsRef.current = [null];
    setHasNext(true);

    setPageIndex(0);
    setDisplayPageIndex(0);

    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);

    pendingScrollTopRef.current = 0;

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });

    lastPageIndexRef.current = 0;
    lastDisplayPageIndexRef.current = 0;

    queueMicrotask(() => {
      fetchPageRef.current(0);
    });

    // ✅ tạo lại persisted state mới cho "phiên sau reload"
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        persistSoon();
      });
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

  const currentQs = canonicalQs(url.qs || "");
  const restoredQs = canonicalQs(restored?.qs || "");

  // ✅ Quan trọng:
  // - URL rỗng ("/") thì KHÔNG restore full HOME_STATE_V2
  // - tránh mở web lần đầu bị render lại pages stale từ sessionStorage
  // - default Home nên ưu tiên SSR initialRooms
  const allowHeavyRestore =
    currentQs.length > 0 || isBackFromDetail;

  const match =
    !!restored &&
    ttlOk &&
    allowHeavyRestore &&
    restoredQs === currentQs;

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
  const restoredPets = rest.petFilters ?? [];
  const restoredTerms = rest.termFilters ?? ["long"];
  const restoredSort = rest.sortMode ?? "updated_desc";

  setSearch(restoredSearch);
  setPriceDraft(restoredPrice);
  setPriceApplied(restoredPrice);
  setSelectedDistricts(restoredDistricts);
  setSelectedRoomTypes(restoredTypes);
  setMoveFilter(restoredMove);
  setPetFilters(restoredPets);
  setTermFilters(restoredTerms);
  setSortMode(restoredSort);
  setTotal(typeof rest.total === "number" ? rest.total : null);

  const restoredStatus = !isReloadRef.current ? rest.statusFilter ?? null : null;
  setStatusFilter(restoredStatus);

  armRestoredFilterSig({
    search: restoredSearch,
    priceApplied: restoredPrice,
    selectedDistricts: restoredDistricts,
    selectedRoomTypes: restoredTypes,
    moveFilter: restoredMove,
    petFilters: restoredPets,
    termFilters: restoredTerms,
    sortMode: restoredSort,
    statusFilter: restoredStatus,
  });

  // (Giữ behavior cũ khi KHÔNG reload)
      pagesRef.current = rest.pages ?? [];
      setPages(rest.pages ?? []);
      cursorsRef.current = rest.cursors ?? [null];
      setHasNext(Boolean(rest.hasNext));

      setPageIndex(rest.pageIndex ?? 0);
      setDisplayPageIndex(rest.displayPageIndex ?? rest.pageIndex ?? 0);

      didRestoreFromStorageRef.current = true;

     if (typeof rest.scrollTop === "number") {
        pendingScrollTopRef.current = rest.scrollTop;
      }

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

  // ✅ URL rỗng khi mở Home mới thì cũng không restore lite,
  // để ưu tiên SSR initialRooms thay vì cache cũ
  const lite =
    effectiveQs && (effectiveQs.length > 0 || isBackFromDetail)
      ? readLiteForQs(effectiveQs)
      : null;

  if (lite) {
  hydratingFromUrlRef.current = true;
  try {
    const liteSearch = lite.search ?? "";
    const litePrice = lite.priceApplied ?? PRICE_DEFAULT;
    const liteDistricts = lite.selectedDistricts ?? [];
    const liteTypes = lite.selectedRoomTypes ?? [];
    const liteMove = lite.moveFilter ?? null;
    const litePets = lite.petFilters ?? [];
    const liteTerms = lite.termFilters ?? ["long"];
    const liteSort = lite.sortMode ?? "updated_desc";
    const liteStatus = !isReloadRef.current ? lite.statusFilter ?? null : null;

    setSearch(liteSearch);
    setPriceDraft(litePrice);
    setPriceApplied(litePrice);
    setSelectedDistricts(liteDistricts);
    setSelectedRoomTypes(liteTypes);
    setMoveFilter(liteMove);
    setPetFilters(litePets);
    setTermFilters(liteTerms);
    setSortMode(liteSort);
    setTotal(typeof lite.total === "number" ? lite.total : null);
    setStatusFilter(liteStatus);

    armRestoredFilterSig({
      search: liteSearch,
      priceApplied: litePrice,
      selectedDistricts: liteDistricts,
      selectedRoomTypes: liteTypes,
      moveFilter: liteMove,
      petFilters: litePets,
      termFilters: liteTerms,
      sortMode: liteSort,
      statusFilter: liteStatus,
    });

    const pIdx = lite.pageIndex ?? 0;
    const dIdx = lite.displayPageIndex ?? pIdx;

      cursorsRef.current = [null];
      cursorsRef.current[pIdx] = (lite.currentCursor ?? null) as UrlCursor;

      setPageIndex(pIdx);
      setDisplayPageIndex(dIdx);
      setHasNext(Boolean(lite.hasNext));

      setFetchError("");
      setLoading(false);
      setShowSkeleton(true);

      if (typeof lite.scrollTop === "number") {
        pendingScrollTopRef.current = lite.scrollTop;
      }

      try {
        sessionStorage.removeItem(HOME_BACK_HINT_KEY);
      } catch {}
      finishHydrate();
      didApplyBackOnceRef.current = true;
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
    new URLSearchParams(window.location.search).has(QS.pet) ||
    new URLSearchParams(window.location.search).has(QS.term) ||
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
  pets: url.pet,
  terms: url.term,
  sort: url.s,
  status: isReloadRef.current ? null : url.st,
};

const urlPrice: [number, number] = [url.minVal, url.maxVal];
const urlStatus = isReloadRef.current ? null : url.st;
const urlPets = url.pet ?? [];
const urlTerms = url.term ?? ["long"];

setSearch(url.q);
setPriceDraft(urlPrice);
setPriceApplied(urlPrice);
setSelectedDistricts(url.d);
setSelectedRoomTypes(url.t);
setMoveFilter(url.m);
setPetFilters(urlPets);
setTermFilters(urlTerms);
setSortMode(url.s);
setStatusFilter(urlStatus);

armRestoredFilterSig({
  search: url.q,
  priceApplied: urlPrice,
  selectedDistricts: url.d,
  selectedRoomTypes: url.t,
  moveFilter: url.m,
  petFilters: urlPets,
  termFilters: urlTerms,
  sortMode: url.s,
  statusFilter: urlStatus,
});

const pageFromUrl = url.nextPage;

filtersVersionRef.current += 1;

resetPagination(pageFromUrl);
// ✅ nếu URL có cursor thì dùng cursor đó cho page này
cursorsRef.current[pageFromUrl] = url.c ?? null;

// ✅ IMPORTANT: pageIndex có thể không đổi (thường là 0) => CENTRAL FETCH effect sẽ không chạy
// Force fetch đúng page theo URL sau khi reset cache.
queueMicrotask(() => {
  fetchPageRef.current(pageFromUrl);
});

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

    const snap = readBackSnapshot();
    if (!snap) return;

    didApplyBackOnceRef.current = true;
    applyBackSnapshot(snap);

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
}, [applyBackSnapshot, readBackSnapshot]);

  // ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const onPop = () => {
   if (didApplyBackOnceRef.current) return;

    persistBlockedRef.current = true;
    skipNextFilterEffectRef.current = true;

    const url = readUrlState();

    // ưu tiên history scroll trước
    const restoredByHistory = restoreScrollFromHistory();

    // ================== 1) ƯU TIÊN BACK SNAPSHOT ==================
    const snap = readBackSnapshot();
    if (snap) {
      applyBackSnapshot(snap);
      didApplyBackOnceRef.current = true;   

      try {
        sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
      } catch {}

      return;
    }

    // ================== 2) FALLBACK: LITE STATE THEO QS ==================
    const effectiveQs = url.qs || "";
    const lite =
    effectiveQs.length > 0 ? readLiteForQs(effectiveQs) : null;

    if (lite) {
  hydratingFromUrlRef.current = true;
 try {
  const liteSearch = lite.search ?? "";
  const litePrice = lite.priceApplied ?? PRICE_DEFAULT;
  const liteDistricts = lite.selectedDistricts ?? [];
  const liteTypes = lite.selectedRoomTypes ?? [];
  const liteMove = lite.moveFilter ?? null;
  const litePets = lite.petFilters ?? [];
  const liteTerms = lite.termFilters ?? ["long"];
  const liteSort = lite.sortMode ?? "updated_desc";
  const liteStatus = !isReloadRef.current ? lite.statusFilter ?? null : null;

  setSearch(liteSearch);
  setPriceDraft(litePrice);
  setPriceApplied(litePrice);
  setSelectedDistricts(liteDistricts);
  setSelectedRoomTypes(liteTypes);
  setMoveFilter(liteMove);
  setPetFilters(litePets);
  setTermFilters(liteTerms);
  setSortMode(liteSort);
  setTotal(typeof lite.total === "number" ? lite.total : null);
  setStatusFilter(liteStatus);

  const pIdx = lite.pageIndex ?? 0;
  const dIdx = lite.displayPageIndex ?? pIdx;

  armRestoredFilterSig({
    search: liteSearch,
    priceApplied: litePrice,
    selectedDistricts: liteDistricts,
    selectedRoomTypes: liteTypes,
    moveFilter: liteMove,
    petFilters: litePets,
    termFilters: liteTerms,
    sortMode: liteSort,
    statusFilter: liteStatus,
  });
  skipNextFilterEffectRef.current = true;

  // ✅ QUAN TRỌNG: clear cache cũ để tránh UI đúng nhưng list sai
  pagesRef.current = [];
  setPages([]);

    cursorsRef.current = [null];
    cursorsRef.current[pIdx] = (lite.currentCursor ?? null) as UrlCursor;
    setHasNext(Boolean(lite.hasNext));

    setPageIndex(pIdx);
    setDisplayPageIndex(dIdx);

    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);

    if (!restoredByHistory && typeof lite.scrollTop === "number") {
      pendingScrollTopRef.current = lite.scrollTop;
    }

    // ✅ rebuild URL từ lite để chắc chắn URL khớp state
  const qsFromLite = buildQs({
  q: liteSearch,
  min: litePrice[0],
  max: litePrice[1],
  d: liteDistricts,
  t: liteTypes,
  m: liteMove,
  pet: litePets,
  term: liteTerms,
  s: liteSort,
  st: liteStatus,
  p: pIdx,
  c: (lite.currentCursor ?? null) as UrlCursor,
});
    replaceUrlShallow(qsFromLite);

    // ✅ fetch lại data theo filter đã restore
    queueMicrotask(() => {
      fetchPageRef.current(pIdx);
    });

    setTimeout(() => {
      persistBlockedRef.current = false;
    }, 400);

    didApplyBackOnceRef.current = true;
    endHydrationAfterTwoFrames();
    return;
  } finally {
    queueMicrotask(() => {
      hydratingFromUrlRef.current = false;
    });
  }
}

   // ================== 3) CUỐI CÙNG: HYDRATE THEO URL + FETCH ==================
hydratingFromUrlRef.current = true;

const urlPrice: [number, number] = [url.minVal, url.maxVal];
const urlStatus = isReloadRef.current ? null : url.st;
const urlPets = url.pet ?? [];
const urlTerms = url.term ?? ["long"];

setSearch(url.q);
setPriceDraft(urlPrice);
setPriceApplied(urlPrice);
setSelectedDistricts(url.d);
setSelectedRoomTypes(url.t);
setMoveFilter(url.m);
setPetFilters(urlPets);
setTermFilters(urlTerms);
setSortMode(url.s);
setStatusFilter(urlStatus);

armRestoredFilterSig({
  search: url.q,
  priceApplied: urlPrice,
  selectedDistricts: url.d,
  selectedRoomTypes: url.t,
  moveFilter: url.m,
  petFilters: urlPets,
  termFilters: urlTerms,
  sortMode: url.s,
  statusFilter: urlStatus,
});

filtersVersionRef.current += 1;
resetPagination(url.nextPage);
cursorsRef.current[url.nextPage] = url.c ?? null;

queueMicrotask(() => {
  hydratingFromUrlRef.current = false;
});

    fetchPageRef.current(url.nextPage);
    didApplyBackOnceRef.current = true; 

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          persistBlockedRef.current = false;
        }, 400);

        endHydrationAfterTwoFrames();
      });
    });
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [
  applyBackSnapshot,
  readBackSnapshot,
  readUrlState,
  resetPagination,
  endHydrationAfterTwoFrames,
  readLiteForQs,
]);

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
      const visiblePage = pagesRef.current[targetIndex] as any[] | undefined;

      const hasVisibleData = Array.isArray(visiblePage) && visiblePage.length > 0;

if (isVisible) {
  setLoading(true);

  if (hasVisibleData) {
    setIsRefreshing(true);
    setShowSkeleton(false);
  } else {
    setIsRefreshing(false);
    setShowSkeleton(true);
  }
}

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
petPolicies: (pending?.pets ?? petFilters).length
  ? (pending?.pets ?? petFilters)
  : undefined,
contractTerms: (pending?.terms ?? termFilters).length
  ? (pending?.terms ?? termFilters)
  : undefined,
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
      if (isVisible) {
        setFetchError(e?.message ?? "Tải dữ liệu thất bại");
        setLoading(false);
        setShowSkeleton(false);
        setIsRefreshing(false);
      }
    } finally {
      inFlightRef.current[reqKey] = false;

      if (isVisible) {
        setLoading(false);
        setShowSkeleton(false);
        setIsRefreshing(false);
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
    petFilters,
    termFilters,
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

    const nextCursor = cursorsRef.current[pageIndex + 1] ?? null;
    setHasNext(Boolean(nextCursor));

    return;
  }

  const cached = pagesRef.current[pageIndex];

  // ✅ chỉ fetch khi CHƯA từng fetch (undefined)
  if (cached === undefined) {
    fetchPage(pageIndex);
  } else {
    setShowSkeleton(false);
    setDisplayPageIndex(pageIndex);

    const nextCursor = cursorsRef.current[pageIndex + 1] ?? null;
    setHasNext(Boolean(nextCursor));
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
  console.log("FILTER_CHANGE", {
    skip: skipNextFilterEffectRef.current,
    hydrating: hydratingFromUrlRef.current,
    filterSig,
    last: lastFilterSigRef.current,
    pending: pendingRestoredFilterSigRef.current,
    moveFilter,
  });

  const applied = appliedSearch.trim();

  // ✅ nếu vừa restore/back/hydrate thì chờ đến đúng signature đã restore
  if (pendingRestoredFilterSigRef.current) {
    if (filterSig !== pendingRestoredFilterSigRef.current) {
      prevAppliedSearchRef.current = applied;
      return;
    }

    lastFilterSigRef.current = filterSig;
    prevAppliedSearchRef.current = applied;
    pendingRestoredFilterSigRef.current = null;
    skipNextFilterEffectRef.current = false;
    return;
  }

  // ✅ nếu vừa restore/back/hydrate thì chỉ đồng bộ signature, KHÔNG reset
  if (skipNextFilterEffectRef.current || hydratingFromUrlRef.current) {
    skipNextFilterEffectRef.current = false;
    lastFilterSigRef.current = filterSig;
    prevAppliedSearchRef.current = applied;
    return;
  }

  // ✅ không đổi filter thật sự -> không làm gì
  if (filterSig === lastFilterSigRef.current) return;

  // ====== Special logic for SEARCH baseline ======
  const prevApplied = prevAppliedSearchRef.current;
  const searchBecameNonEmpty = prevApplied === "" && applied !== "";
  const searchBecameEmpty = prevApplied !== "" && applied === "";

  // cập nhật applied search hiện tại
  prevAppliedSearchRef.current = applied;

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

    const qsBack = buildQs({
      q: "",
      min: priceApplied[0],
      max: priceApplied[1],
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      pet: petFilters,
      term: termFilters,
      s: sortMode,
      st: statusFilter,
      p: base.pageIndex,
      c: (base.cursors[base.pageIndex] ?? null) as UrlCursor,
    });

    preSearchBaselineRef.current = null;

    armRestoredFilterSig({
  search: "",
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,
  sortMode,
  statusFilter,
});

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
  pet: petFilters,
  term: termFilters,
  s: sortMode,
  st: statusFilter,
  p: 0,
  c: null,
});

  if (filterApplyTimerRef.current) {
    window.clearTimeout(filterApplyTimerRef.current);
  }

  filterApplyTimerRef.current = window.setTimeout(() => {
    // ✅ chỉ tại đây mới chốt lastFilterSig, vì đây mới là "user đổi filter thật"
    lastFilterSigRef.current = filterSig;
    pendingRestoredFilterSigRef.current = null;

    replaceUrlShallow(qs);
    setTotal(null);

    pagesRef.current = [];
    setPages([]);
    cursorsRef.current = [null];

    setDisplayPageIndex(0);
    resetPagination(0);

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });

    fetchPage(0);
    persistSoon();
  }, 200);

  return () => {
    if (filterApplyTimerRef.current) {
      window.clearTimeout(filterApplyTimerRef.current);
    }
  };
}, [
  filterSig,
  appliedSearch,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  statusFilter,
  buildQs,
  replaceUrlShallow,
  resetPagination,
  persistSoon,
  fetchPage,
  displayPageIndex,
  hasNext,
  armRestoredFilterSig,
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
  q: appliedSearch.trim(),
  min: priceApplied[0],
  max: priceApplied[1],
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
pet: petFilters,
term: termFilters,
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
    appliedSearch,
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
  q: appliedSearch.trim(),
  min: priceApplied[0],
  max: priceApplied[1],
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
pet: petFilters,
term: termFilters,
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
    appliedSearch,
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

const handleNavigateToRoom = useCallback((href: string) => {
  try {
    const el = scrollRef.current;

    // ✅ đồng bộ ref ngay trước khi snapshot
    if (el) lastScrollTopRef.current = el.scrollTop;
    lastPageIndexRef.current = pageIndex;
    lastDisplayPageIndexRef.current = displayPageIndex;

    saveScrollToHistory();
    writeBackSnapshotNow();

    const qsRaw = window.location.search.replace(/^\?/, "");
    const qsCanonical = canonicalQs(qsRaw);

    sessionStorage.setItem(
      HOME_BACK_HINT_KEY,
      JSON.stringify({
        ts: Date.now(),
        qs: qsCanonical,
      })
    );
  } catch {}

  router.push(href);
}, [
  router,
  writeBackSnapshotNow,
  saveScrollToHistory,
  pageIndex,
  displayPageIndex,
]);

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
            priceApplied={priceApplied}
            setPriceDraft={setPriceDraft}
            setPriceApplied={setPriceApplied}
            selectedDistricts={selectedDistricts}
            setSelectedDistricts={setSelectedDistricts}
            selectedRoomTypes={selectedRoomTypes}
            setSelectedRoomTypes={setSelectedRoomTypes}
            moveFilter={moveFilter}
            setMoveFilter={setMoveFilter}
            petFilters={petFilters}
            setPetFilters={setPetFilters}
            termFilters={termFilters}
            setTermFilters={setTermFilters}

            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}

            sortMode={sortMode}
            setSortMode={setSortMode}
            total={total}
            onResetAll={() => {
              setSelectedDistricts([]);
              setSelectedRoomTypes([]);
              setMoveFilter(null);
              setPetFilters([]);
              setTermFilters(["long"]);
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
          onNavigate={handleNavigateToRoom}
          isRefreshing={isRefreshing}
        />
      </div>

      <div className="sticky bottom-0 z-[950] shrink-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <Pagination
              goNext={goNext}
              goPrev={goPrev}
              hasNext={hasNext}
              loading={loading}
              total={typeof total === "number" ? total : undefined}
            />
       </div>

      {/* portal root nếu bạn đang dùng */}
      <div id="portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
    </div>
  );
};

export default HomeClient;
