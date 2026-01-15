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
const DEFAULT_SORT: SortMode = "updated_desc";

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

const PRICE_DEFAULT: [number, number] = [3_000_000, 50_000_000];
const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 30 * 60 * 1000; // 15 phút
const HOME_STATE_KEY = "HOME_STATE_V2"; // bump key để tránh conflict state cũ

type PersistState = {
  // url signature để chỉ restore khi đúng state
  qs: string;

 // ✅ total rooms
  total: number | null;

  // filters
  search: string;
  priceApplied: [number, number];
  districtApplied: string[];
  roomTypeApplied: string[];
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

  const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
 const dlog = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

  const homePathRef = useRef<string>("");      // pathname của Home lúc mount
  const listQsRef = useRef<string>("");        // qs ổn định của list
  const didRestoreFromStorageRef = useRef(false);
  // ✏️ CHANGE: status draft/applied
const [statusDraft, setStatusDraft] = useState<string | null>(null);
const [statusApplied, setStatusApplied] = useState<string | null>(null);
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

  const [districtDraft, setDistrictDraft] = useState<string[]>([]);
  const [districtApplied, setDistrictApplied] = useState<string[]>([]);

  const [roomTypeDraft, setRoomTypeDraft] = useState<string[]>([]);
const [roomTypeApplied, setRoomTypeApplied] = useState<string[]>([]);

  // ✏️ CHANGE: move draft/applied
const [moveDraft, setMoveDraft] = useState<"elevator" | "stairs" | null>(null);
const [moveApplied, setMoveApplied] = useState<"elevator" | "stairs" | null>(null);
  const hardRestoreRef = useRef(false);

// ✏️ CHANGE: sort draft/applied
const [sortDraft, setSortDraft] = useState<SortMode>("updated_desc");
const [sortApplied, setSortApplied] = useState<SortMode>("updated_desc");
const sortModeRef = useRef<SortMode>("updated_desc"); // giữ ref để dùng khi Apply

useEffect(() => {
  sortModeRef.current = sortDraft; // ✏️ CHANGE
}, [sortDraft]); // ✏️ CHANGE

  //-----------------appliedSearch------------
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // ✅ ADD: giữ applied state mới nhất để snapshot khi click sang detail không bị stale
const appliedStateRef = useRef({
  search: "",
  priceApplied: PRICE_DEFAULT as [number, number],
  districtApplied: [] as string[],
  roomTypeApplied: [] as string[],
  moveApplied: null as ("elevator" | "stairs" | null),
  sortApplied: "updated_desc" as SortMode,
  statusApplied: null as (string | null),
});

useEffect(() => {
  appliedStateRef.current = {
    search,
    priceApplied,
    districtApplied,
    roomTypeApplied,
    moveApplied,
    sortApplied,
    statusApplied,
  };
}, [search, priceApplied, districtApplied, roomTypeApplied, moveApplied, sortApplied, statusApplied]);


  // ✅ ADD: snapshot applied filters để fetch dùng ngay, tránh lệch 1 nhịp
type AppliedSnapshot = {
  search: string;
  minPrice: number;
  maxPrice: number;
  districts: string[];
  roomTypes: string[];
  move: "elevator" | "stairs" | null;
  sortMode: SortMode;
  status: string | null;
};

const appliedRef = useRef<AppliedSnapshot>({
  search: "",
  minPrice: PRICE_DEFAULT[0],
  maxPrice: PRICE_DEFAULT[1],
  districts: [],
  roomTypes: [],
  move: null,
  sortMode: "updated_desc",
  status: null,
}); // ✅ ADD

// ================== DEFAULT RESET (Hướng A) ==================
const resetAllToDefault = useCallback(() => {
  // 1) Filters
  setSearch("");
  setAppliedSearch("");
  setPriceDraft(PRICE_DEFAULT);
  setPriceApplied(PRICE_DEFAULT);
  setDistrictDraft([]);
  setDistrictApplied([]);

  setRoomTypeDraft([]);
setRoomTypeApplied([]);

  setMoveDraft(null);
  setMoveApplied(null); 
  setSortDraft("updated_desc");
  setSortApplied("updated_desc");
  setStatusDraft(null);
  setStatusApplied(null); 

  // 2) Pagination / cache
  pagesRef.current = [];
  setPages([]);
  cursorsRef.current = [null];
  setHasNext(true);
  setTotal(null);

  pageIndexRef.current = 0;
  setPageIndex(0);
  setDisplayPageIndex(0);

  // 3) UI state
  setFetchError("");
  setLoading(false);
  setShowSkeleton(true);

  // 4) Scroll
  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    lastScrollTopRef.current = 0;
  });
}, []);
    
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
  const returningFromDetailRef = useRef(false);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<Record<string, boolean>>({});

  // ✅ ADD: fetch page thuần, KHÔNG side-effect (dùng cho restore / pagination)
const fetchPagePure = useCallback(
  async (targetIndex: number) => {
    await fetchPageRef.current(targetIndex);
    setDisplayPageIndex(targetIndex);
  },
  []
);

// ✅ CHANGE: Reload (F5) => reset sạch 100% (xóa cả query)
useEffect(() => {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  if (nav?.type === "reload") {
    try {
      sessionStorage.removeItem(HOME_STATE_KEY);

      // ✅ ADD: xóa snapshot + xóa luôn query trên URL
     window.history.replaceState(
        mergeHistoryState({ __home: undefined }), // ✅ CHANGE
        "",
        pathname
      );

    } catch {}

    // ✅ ADD: reset state React + fetch lại page 0
    resetAllToDefault();        // ✅ ADD
    requestAnimationFrame(() => {
      fetchPageRef.current(0);  // ✅ ADD
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pathname]); // ✅ CHANGE (cần pathname)

  // ================== GUARDS ==================

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


  // scroll container
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const pendingScrollTopRef = useRef<number | null>(null);
   const backRestoreLockRef = useRef(false);
  const lastHistoryScrollWriteAtRef = useRef(0);

const lastPageIndexRef = useRef(0);
const lastDisplayPageIndexRef = useRef(0);

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
  const lastHistoryWriteAtRef = useRef(0);

const saveHomeToHistory = () => {
  const now = Date.now();
  if (now - lastHistoryWriteAtRef.current < 400) return; // chỉ lưu tối đa ~2-3 lần/giây
  lastHistoryWriteAtRef.current = now;

  const snapshot = {
    qs: buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: districtApplied,

      t: roomTypeApplied,
      m: moveApplied,      // ✏️ CHANGE
      s: sortApplied,      // ✏️ CHANGE
      st: statusApplied,   // ✏️ CHANGE
      p: pageIndexRef.current,
    }),
    search,
    priceApplied,
    districtApplied,
    roomTypeApplied,
    moveFilter: moveApplied,      // ✏️ CHANGE
    sortMode: sortApplied,        // ✏️ CHANGE
    statusFilter: statusApplied,  // ✏️ CHANGE
    pageIndex: pageIndexRef.current,
    scrollTop: scrollRef.current?.scrollTop ?? 0,
    cursors: cursorsRef.current,
hasNext,
  };

  window.history.replaceState(
    { ...window.history.state, __home: snapshot },
    ""
  );
};

  function canonicalQs(qs: string) {
  const sp = new URLSearchParams(qs.replace(/^\?/, ""));
  const entries = Array.from(sp.entries());
  entries.sort(([aK, aV], [bK, bV]) => (aK === bK ? aV.localeCompare(bV) : aK.localeCompare(bK)));
  const out = new URLSearchParams();
  for (const [k, v] of entries) out.append(k, v);
  return out.toString();
}
// ✅ ADD: luôn giữ object state, không để replaceState nuốt mất __home
const mergeHistoryState = (patch: any = {}) => {
  const cur = window.history.state;
  const base = cur && typeof cur === "object" ? cur : {};
  return { ...base, ...patch };
};

 const replaceUrlShallow = useCallback(
  (nextQs: string) => {
    if (!nextQs.includes("p=")) {
      console.error("❌ replaceUrlShallow without p", nextQs, new Error().stack);
    }

    const currentQs = window.location.search.replace(/^\?/, "");
    if (nextQs === currentQs) return;

    const url = nextQs ? `${pathname}?${nextQs}` : pathname;

    // ✅ CHANGE: KHÔNG dùng window.history.state trực tiếp nữa (có thể null)
    window.history.replaceState(mergeHistoryState(), "", url);

    listQsRef.current = nextQs;
  },
  [pathname]
);

// ✅ ADD: parse number an toàn (thiếu/invalid => fallback)
const parseNum = (v: string | null) => {
  if (v == null) return NaN;
  const s = v.trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

  const readUrlState = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);

    const q = sp.get(QS.q) ?? "";
    const min = parseNum(sp.get(QS.min)); 
    const max = parseNum(sp.get(QS.max)); 
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

  useEffect(() => {
  const { q, minVal, maxVal, d, t, m, s, st, nextPage } = readUrlState();
  // ✅ ADD: sync appliedRef theo URL ngay từ đầu để fetchPage dùng đúng
appliedRef.current = {
  search: (q ?? "").trim(),
  minPrice: minVal,
  maxPrice: maxVal,
  districts: d ?? [],
  roomTypes: t ?? [],
  move: m ?? null,
  sortMode: (s ?? "updated_desc") as SortMode,
  status: st ?? null,
};

  // set cả draft + applied
  setSearch(q ?? "");
  setAppliedSearch(q ?? "");

  setPriceDraft([minVal, maxVal]);
  setPriceApplied([minVal, maxVal]);

  setDistrictDraft(d ?? []);
  setDistrictApplied(d ?? []);

  setRoomTypeDraft(t ?? []);
  setRoomTypeApplied(t ?? []);

setMoveDraft(m ?? null);                 // ✏️ CHANGE
setMoveApplied(m ?? null);               // ✅ ADD

setSortDraft(s ?? "updated_desc");       // ✏️ CHANGE
setSortApplied(s ?? "updated_desc");     // ✅ ADD

setStatusDraft(st ?? null);              // ✏️ CHANGE
setStatusApplied(st ?? null);            // ✅ ADD

  // giữ đúng page từ URL
  const p = Number.isFinite(nextPage) && nextPage >= 0 ? nextPage : 0;
  pageIndexRef.current = p;
  setPageIndex(p);
  setDisplayPageIndex(p);

  // clear cache để data khớp URL
  pagesRef.current = [];
  setPages([]);
  cursorsRef.current = [null];
  setHasNext(true);
  setShowSkeleton(true);

  requestAnimationFrame(() => {
    ensurePage(p).finally(() => {
      setShowSkeleton(false);
    });
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


 // ================== PERSIST (sessionStorage) ==================
const persistRafRef = useRef<number | null>(null);

// ✅ chỉ khai báo 1 lần (đừng để trùng ở file)
const navigatingAwayRef = useRef(false);

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
    d: districtApplied,

   t: roomTypeApplied,

m: moveApplied,         // ✅ CHANGE
s: sortApplied,         // ✅ CHANGE
st: statusApplied,      // ✅ CHANGE

    p: pageIndexRef.current,
  });

  return {
    qs: qsNow,

    total: typeof total === "number" ? total : null,

    search,
    priceApplied,
    districtApplied,
    roomTypeApplied,

moveFilter: moveApplied,        // ✅ CHANGE
sortMode: sortApplied,          // ✅ CHANGE
statusFilter: statusApplied,    // ✅ CHANGE

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
  districtApplied,
  roomTypeApplied,
  moveApplied,      // ✅ CHANGE
  sortApplied,      // ✅ CHANGE
  statusApplied,    // ✅ CHANGE
  total,
  displayPageIndex,
  hasNext,
]);


const persistNow = useCallback(
  (force: boolean = false) => {

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

// ================== CLICK ĐI DETAIL (Hướng A: lưu scrollTop) ==================
const onPointerDownCapture = useCallback((ev: PointerEvent) => {
  const target = ev.target as HTMLElement | null;
  const a = target?.closest("a") as HTMLAnchorElement | null;
  if (!a) return;

  // chỉ xử lý left click
  if (ev.button !== 0) return;

  // bỏ qua new-tab / modifier keys
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

  // bỏ qua nếu mở tab mới / download
  if (a.target === "_blank" || a.hasAttribute("download")) return;

  const hrefAttr = a.getAttribute("href");
  if (!hrefAttr || hrefAttr.startsWith("#")) return;

  // bỏ qua external links (http/https/mailto/tel)
  if (/^(https?:)?\/\//i.test(hrefAttr) || /^mailto:|^tel:/i.test(hrefAttr)) return;

  const scrollTop = scrollRef.current?.scrollTop ?? 0;
 returningFromDetailRef.current = true;
 // ✅ ADD: cancel apply debounce để không có applyNow chạy sau khi click sang detail
if (applyTimerRef.current) {
  window.clearTimeout(applyTimerRef.current);
  applyTimerRef.current = null;
}

// ✅ ADD: đánh dấu đang rời Home để chặn persistSoon / applyFilters về sau
navigatingAwayRef.current = true;

 const st = appliedStateRef.current;

const snapshot = {
  qs: buildQs({
    q: st.search.trim(),
    min: st.priceApplied[0],
    max: st.priceApplied[1],
    d: st.districtApplied,
    t: st.roomTypeApplied,
    m: st.moveApplied,
    s: st.sortApplied,
    st: st.statusApplied,
    p: pageIndexRef.current,
  }),

  search: st.search,
  priceApplied: st.priceApplied,
  districtApplied: st.districtApplied,
  roomTypeApplied: st.roomTypeApplied,

  moveFilter: st.moveApplied,
  sortMode: st.sortApplied,
  statusFilter: st.statusApplied,

  pageIndex: pageIndexRef.current,
  scrollTop,
  cursors: cursorsRef.current,
  hasNext,
};

window.history.replaceState(
  mergeHistoryState({ __home: snapshot }), // ✅ CHANGE
  ""
);
}, []);

// ✅ gắn listener capture để chạy trước router
useEffect(() => {
  const handler = (ev: Event) => onPointerDownCapture(ev as PointerEvent);

  document.addEventListener("pointerdown", handler, { capture: true });

  return () => {
    document.removeEventListener("pointerdown", handler, { capture: true } as any);
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
 
const applyNow = useCallback(() => {
  const nextSearch = search.trim();

  // ✅ ADD: normalize min/max để chắc chắn đúng thứ tự
  const [minP, maxP] = (() => {
    const a = priceDraft[0], b = priceDraft[1];
    return a <= b ? [a, b] : [b, a];
  })();

  // ✅ ADD: bump version để drop request cũ
  filtersVersionRef.current += 1;

  // ✅ ADD: cập nhật snapshot sync để fetch dùng ngay
  appliedRef.current = {
    search: nextSearch,
    minPrice: minP,
    maxPrice: maxP,
    districts: [...districtDraft],
    roomTypes: [...roomTypeDraft],
    move: moveDraft,
    sortMode: sortModeRef.current,
    status: statusDraft,
  };

  // 1️⃣ sync applied state
  setAppliedSearch(nextSearch);
  setPriceApplied([minP, maxP]);
  setDistrictApplied(districtDraft);
  setRoomTypeApplied(roomTypeDraft);

  setMoveApplied(moveDraft);
  setSortApplied(sortModeRef.current);
  setStatusApplied(statusDraft);

  // 2️⃣ reset pagination
  resetPagination(0);

  // 3️⃣ update URL
  const qs = buildQs({
    q: nextSearch,
    min: minP,
    max: maxP,
    d: districtDraft,
    t: roomTypeDraft,
    m: moveDraft,
    s: sortModeRef.current,
    st: statusDraft,
    p: 0,
  });

  replaceUrlShallow(qs);

  // 4️⃣ fetch page 0
  fetchPageRef.current(0);

  // 5️⃣ scroll top (CHỈ khi apply)
  requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  });
}, [
  search,
  priceDraft,
  districtDraft,
  roomTypeDraft,
  moveDraft,
  statusDraft,

  resetPagination,
  buildQs,
  replaceUrlShallow,
]); // ✅ CHANGE (deps đầy đủ)

// ✅ ADD: chỉ apply Search (auto), KHÔNG đụng các draft filter khác
const applySearchOnly = useCallback(() => {
  const nextSearch = search.trim();

  // drop request cũ
  filtersVersionRef.current += 1;

  // update snapshot fetch: chỉ đổi search, giữ nguyên applied filter hiện tại
  appliedRef.current = {
    ...appliedRef.current,
    search: nextSearch,
  };

  setAppliedSearch(nextSearch);

  // reset pagination
  resetPagination(0);

  // update URL: chỉ thay q và p=0, giữ các applied filter đang có
  const qs = buildQs({
    q: nextSearch,
    min: priceApplied[0],
    max: priceApplied[1],
    d: districtApplied,
    t: roomTypeApplied,
    m: moveApplied,
    s: sortApplied,
    st: statusApplied,
    p: 0,
  });

  replaceUrlShallow(qs);
  fetchPageRef.current(0);
}, [
  search,
  resetPagination,
  buildQs,
  replaceUrlShallow,

  priceApplied,
  districtApplied,
  roomTypeApplied,
  moveApplied,
  sortApplied,
  statusApplied,
]);

const applyTimerRef = useRef<number | null>(null);

// ✅ ADD: Apply ngay khi bấm
const applyImmediate = useCallback(() => {
  if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);
  applyTimerRef.current = null;
  applyNow();
}, [applyNow]);


// ✏️ CHANGE: chỉ auto-apply search
useEffect(() => {
  if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);

  applyTimerRef.current = window.setTimeout(() => {
    applySearchOnly(); // ✅ CHANGE
  }, 250);

  return () => {
    if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);
  };
}, [search, applySearchOnly]); // ✅ CHANGE

const onSortChange = useCallback((v: SortMode) => {
  sortModeRef.current = v;
  setSortDraft(v); // ✏️ CHANGE
}, []);

// ================== ENSURE PAGE (cursor pagination) ==================
const ensurePage = useCallback(async (target: number) => {
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;

  for (let i = 0; i <= safeTarget; i++) {
    // pagesRef.current[i] !== undefined nghĩa là đã fetch (kể cả [])
    if (pagesRef.current[i] === undefined) {
      await fetchPageRef.current(i);
    }
  }
}, []);

// ✅ ADD: đọc snapshot lưu trong history.state.__home (nguồn chuẩn nhất khi back từ detail)
const readHomeSnapshotFromHistory = useCallback(() => {
  const st = window.history.state as any;
  const home = st?.__home as any | undefined;
  if (!home) return null;

  return {
    pageIndex: typeof home.pageIndex === "number" ? home.pageIndex : 0,
    scrollTop: typeof home.scrollTop === "number" ? home.scrollTop : 0,
    qs: typeof home.qs === "string" ? home.qs : "",
  };
}, []);

// ================== POPSTATE (back/forward) ==================
useEffect(() => {
  const onPop = () => {
    // ✅ 1) ƯU TIÊN snapshot history (__home) => đúng khi back từ detail
    const snap = readHomeSnapshotFromHistory();

    // ✅ helper parse qs -> state (dùng parseNum để tránh 0)
    const applyFromQs = (qs: string, p: number, scrollTop: number) => {
      const sp = new URLSearchParams(qs);

      const q = sp.get(QS.q) ?? "";
      const min = parseNum(sp.get(QS.min)); // ✅ IMPORTANT
      const max = parseNum(sp.get(QS.max)); // ✅ IMPORTANT
      const d = parseList(sp.get(QS.d));
      const t = parseList(sp.get(QS.t));
      const m = (sp.get(QS.m) as "elevator" | "stairs" | null) || null;
      const s = (sp.get(QS.s) as SortMode) || "updated_desc";
      const st = sp.get(QS.st) || null;

      const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
      const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];

      // ✅ seed appliedRef để fetch dùng đúng filter ngay
      appliedRef.current = {
        search: q.trim(),
        minPrice: minVal,
        maxPrice: maxVal,
        districts: d ?? [],
        roomTypes: t ?? [],
        move: m ?? null,
        sortMode: (s ?? "updated_desc") as SortMode,
        status: st ?? null,
      };

      // ✅ set draft + applied
      setSearch(q);
      setAppliedSearch(q);

      setPriceDraft([minVal, maxVal]);
      setPriceApplied([minVal, maxVal]);

      setDistrictDraft(d ?? []);
      setDistrictApplied(d ?? []);

      setRoomTypeDraft(t ?? []);
      setRoomTypeApplied(t ?? []);

      setMoveDraft(m ?? null);
      setMoveApplied(m ?? null);

      setSortDraft(s ?? "updated_desc");
      setSortApplied(s ?? "updated_desc");

      setStatusDraft(st ?? null);
      setStatusApplied(st ?? null);

      // ✅ page
      const safeP = Number.isFinite(p) && p >= 0 ? p : 0;
      pageIndexRef.current = safeP;
      setPageIndex(safeP);
      setDisplayPageIndex(safeP);

      // ✅ clear cache và fetch đúng page
      pagesRef.current = [];
      setPages([]);
      cursorsRef.current = [null];
      setHasNext(true);
      setShowSkeleton(true);

      requestAnimationFrame(() => {
        (async () => {
          await ensurePage(safeP);
          setShowSkeleton(false);

          // ✅ restore scroll chắc chắn (từ snapshot)
          requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = scrollTop;
            lastScrollTopRef.current = scrollTop;
          });
        })();
      });
    };

    if (snap?.qs) {
      // ✅ dùng snapshot
      applyFromQs(snap.qs, snap.pageIndex, snap.scrollTop);
      return;
    }

    // ✅ 2) FALLBACK: không có snapshot => restore theo URL hiện tại
    const { q, minVal, maxVal, d, t, m, s, st, nextPage } = readUrlState();
    const p = Number.isFinite(nextPage) && nextPage >= 0 ? nextPage : 0;

    // build qs từ URL để dùng chung logic applyFromQs
    const qs = buildQs({
      q: q ?? "",
      min: minVal,
      max: maxVal,
      d: d ?? [],
      t: t ?? [],
      m: m ?? null,
      s: s ?? "updated_desc",
      st: st ?? null,
      p,
    });

    const savedScroll = (window.history.state as any)?.__home?.scrollTop;
    applyFromQs(qs, p, typeof savedScroll === "number" ? savedScroll : 0);
  };

  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [
  readHomeSnapshotFromHistory, // ✅ ADD
  readUrlState,
  buildQs,
  ensurePage,
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
 
    const reqKey = `page::${targetIndex}`;
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

      // ✅ ADD: dùng snapshot applied để tránh state chưa kịp update
      const snap = appliedRef.current;

      const res = await fetchRooms({
        limit: LIMIT,
        cursor: cursorForThisPage,
        adminLevel,

        search: snap.search ? snap.search : undefined,
        minPrice: snap.minPrice,
        maxPrice: snap.maxPrice,
        sortMode: snap.sortMode,
        status: snap.status,

        districts: snap.districts.length ? snap.districts : undefined,
        roomTypes: snap.roomTypes.length ? snap.roomTypes : undefined,
        move: snap.move ?? undefined,
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
      const nextKey = `page::${nextIdx}`;

      // ✅ inFlightRef dùng key string, không phải index number
      
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
  [adminLevel] // ✏️ CHANGE
);

useEffect(() => {
  fetchPageRef.current = fetchPage;
}, [fetchPage]);

// ================== APPLY PENDING SCROLL (after pages ready) ==================
useEffect(() => {
  const pending = pendingScrollTopRef.current;
  if (pending == null) return;

  // chỉ chạy khi page hiện tại đã có data (để có chiều cao đủ)
  const cached = pagesRef.current[pageIndex];
  if (cached === undefined) return;

  const el = scrollRef.current;
  if (!el) return;

  let tries = 0;
  const maxTries = 60; // ~60 frame (~1s)

  const finishRestore = () => {
    // ✅ chỉ clear pending khi kết thúc restore
    pendingScrollTopRef.current = null;

    lastScrollTopRef.current = el.scrollTop;

       // ✅ QUAN TRỌNG: mấy cái này nếu không hạ thì FILTER EFFECT sẽ bị chặn mãi
    hardRestoreRef.current = false;
    backRestoreLockRef.current = false;

    setShowSkeleton(false);
  };

  const tryApply = () => {
    const el2 = scrollRef.current;
    if (!el2) return;

    const maxScroll = Math.max(0, el2.scrollHeight - el2.clientHeight);

    // chưa đủ chiều cao để scroll tới pending -> chờ thêm
    if (maxScroll < pending - 5 && tries < maxTries) {
      tries += 1;
      requestAnimationFrame(tryApply);
      return;
    }

    // đủ chiều cao (hoặc hết tries) -> scroll tới mức tối đa có thể
    const target = Math.min(pending, maxScroll);

    dlog("🟩 APPLY SCROLL start", {
      pending,
      target,
      before: el2.scrollTop,
      scrollHeight: el2.scrollHeight,
      clientHeight: el2.clientHeight,
      tries,
    });

    el2.scrollTop = target;

    dlog("🟩 APPLY SCROLL after", {
      after: el2.scrollTop,
      scrollHeight: el2.scrollHeight,
      clientHeight: el2.clientHeight,
      tries,
    });

    // nếu browser chưa chịu set scroll (do layout đang đổi) -> thử lại
    if (Math.abs(el2.scrollTop - target) > 5 && tries < maxTries) {
      tries += 1;
      requestAnimationFrame(tryApply);
      return;
    }

    finishRestore();
  };

  requestAnimationFrame(tryApply);

  // ✅ fail-safe: dù không scroll được cũng phải mở khóa (tránh “filter UI đổi nhưng list đứng im”)
  const t = window.setTimeout(() => {
    if (pendingScrollTopRef.current != null) {
      dlog("🟧 APPLY SCROLL timeout -> force finishRestore", { pending });
      finishRestore();
    }
  }, 1200);

  return () => window.clearTimeout(t);
}, [pageIndex, pages]);


// ================== SCROLL PERSIST (Hướng A) ==================
useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;

  let raf = 0;

const onScroll = () => {
  if (raf) return;

  raf = requestAnimationFrame(() => {
    raf = 0;

    lastScrollTopRef.current = el.scrollTop;

    // ✅ throttle replaceState để tránh IPC flooding
    const now = Date.now();
    if (now - lastHistoryScrollWriteAtRef.current < 250) return;
    lastHistoryScrollWriteAtRef.current = now;

    try {
      window.history.replaceState(
        {
          ...window.history.state,
          __home: {
            ...(window.history.state as any)?.__home,
            scrollTop: el.scrollTop,
          },
        },
        ""
      );
    } catch {}
  });
};
  el.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    el.removeEventListener("scroll", onScroll as any);
    if (raf) cancelAnimationFrame(raf);
  };
}, []);

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
    d: districtApplied,
    t: roomTypeApplied,
    m: moveApplied,       
    s: sortApplied,        
    st: statusApplied,    
    p: next,
  });

  replaceUrlShallow(qs);
  saveHomeToHistory();
  persistSoon();

  // ✅ ADD: fetch page thuần (KHÔNG reset gì)
  fetchPagePure(next);
}, [
  loading,
  hasNext,
  pageIndex,
  buildQs,
  replaceUrlShallow,
  search,
  priceApplied,
  districtApplied,
  roomTypeApplied,
   moveApplied,     // ✅ CHANGE
  sortApplied,     // ✅ CHANGE
  persistSoon,
  statusApplied,   // ✅ CHANGE

  fetchPagePure, 
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
    d: districtApplied,
    t: roomTypeApplied,
    m: moveApplied,        
    s: sortApplied,        
    st: statusApplied,     
    p: next,
  });

  replaceUrlShallow(qs);
  saveHomeToHistory();
  persistSoon();

  // ✅ ADD: fetch page thuần
  fetchPagePure(next);
}, [
  loading,
  pageIndex,
  buildQs,
  replaceUrlShallow,
  search,
  priceApplied,
  districtApplied,
  roomTypeApplied,
   moveApplied,     // ✅ CHANGE
  sortApplied,     // ✅ CHANGE
  persistSoon,
  statusApplied,   // ✅ CHANGE
  fetchPagePure, 
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
              total={total}

              search={search}
              setSearch={setSearch}

              priceDraft={priceDraft}
              setPriceDraft={setPriceDraft}

              districtDraft={districtDraft}
              setDistrictDraft={setDistrictDraft}

              roomTypeDraft={roomTypeDraft}
              setRoomTypeDraft={setRoomTypeDraft}

              moveFilter={moveDraft}                 
              setMoveFilter={setMoveDraft}           

              statusFilter={statusDraft}             
              setStatusFilter={setStatusDraft}       

              sortMode={sortDraft}                   
              onSortChange={onSortChange}            // (giữ tên handler, bước sau sẽ sửa logic)

              onApply={applyImmediate} // ✏️ CHANGE: nút Apply chạy ngay
              onResetAll={() => {}}
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
