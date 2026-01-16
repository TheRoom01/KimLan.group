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
  initialTotal?: number | null;
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
  // để URLSearchParams tự encode
  return arr.join(",");
}

// parse number an toàn
const parseNum = (v: string | null) => {
  if (v == null) return NaN;
  const s = v.trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const PRICE_DEFAULT: [number, number] = [3_000_000, 50_000_000];

const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 30 * 60 * 1000; // 30 phút
const HOME_STATE_KEY = "HOME_STATE_V2";
const HOME_RELOAD_GUARD_KEY = "HOME_RELOAD_GUARD_TIMEORIGIN_V1";

type PersistState = {
  qs: string;
  total: number | null;

  search: string;
  priceApplied: [number, number];
  districtApplied: string[];
  roomTypeApplied: string[];
  moveFilter: "elevator" | "stairs" | null;
  sortMode: SortMode;
  statusFilter: string | null;

  pageIndex: number;
  cursors: (string | UpdatedDescCursor | null)[];
  hasNext: boolean;

  scrollTop: number;
  ts: number;
};

const writeBackHint = (snapshot: any) => {
  try {
    sessionStorage.setItem(
      HOME_BACK_HINT_KEY,
      JSON.stringify({ ts: Date.now(), snapshot })
    );
  } catch {}
};

const readBackHint = () => {
  try {
    const raw = sessionStorage.getItem(HOME_BACK_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts ?? 0);
    if (!ts || Date.now() - ts > HOME_BACK_HINT_TTL) return null;
    return parsed?.snapshot ?? null;
  } catch {
    return null;
  }
};

function canonicalQs(qs: string) {
  const sp = new URLSearchParams(qs.replace(/^\?/, ""));
  const entries = Array.from(sp.entries());
  entries.sort(([aK, aV], [bK, bV]) =>
    aK === bK ? aV.localeCompare(bV) : aK.localeCompare(bK)
  );
  const out = new URLSearchParams();
  for (const [k, v] of entries) out.append(k, v);
  return out.toString();
}

const mergeHistoryState = (patch: any = {}) => {
  const cur = window.history.state;
  const base = cur && typeof cur === "object" ? cur : {};
  return { ...base, ...patch };
};

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

const HomeClient = ({
  initialRooms,
  initialNextCursor,
  initialAdminLevel,
  initialTotal,
}: InitialProps) => {
  const pathname = usePathname();

  // ====== refs / flags ======
  const homePathRef = useRef<string>(""); // pathname Home lúc mount
  const isRestoringRef = useRef(false);
  const backRestoreLockRef = useRef(false);
  const navigatingAwayRef = useRef(false);

  const skipNextAutoApplyRef = useRef(false);
  const autoApplyGenRef = useRef(0);
  const applyTimerRef = useRef<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const pendingScrollTopRef = useRef<number | null>(null);

  const filtersVersionRef = useRef(0);
  const inFlightRef = useRef<Record<string, boolean>>({});

  const isOnHomeNow = () => {
    const home = homePathRef.current || "/";
    return window.location.pathname === home;
  };

  // ====== role ======
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);

  // ====== total ======
  const [total, setTotal] = useState<number | null>(
    typeof initialTotal === "number" ? initialTotal : null
  );

  // ====== filter draft/applied ======
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
  const [statusApplied, setStatusApplied] = useState<string | null>(null);

  const [priceDraft, setPriceDraft] = useState<[number, number]>(PRICE_DEFAULT);
  const [priceApplied, setPriceApplied] =
    useState<[number, number]>(PRICE_DEFAULT);

  const [districtDraft, setDistrictDraft] = useState<string[]>([]);
  const [districtApplied, setDistrictApplied] = useState<string[]>([]);

  const [roomTypeDraft, setRoomTypeDraft] = useState<string[]>([]);
  const [roomTypeApplied, setRoomTypeApplied] = useState<string[]>([]);

  const [moveDraft, setMoveDraft] = useState<"elevator" | "stairs" | null>(null);
  const [moveApplied, setMoveApplied] = useState<
    "elevator" | "stairs" | null
  >(null);

  const [sortDraft, setSortDraft] = useState<SortMode>("updated_desc");
  const [sortApplied, setSortApplied] = useState<SortMode>("updated_desc");
  const sortModeRef = useRef<SortMode>("updated_desc");
  useEffect(() => {
    sortModeRef.current = sortDraft;
  }, [sortDraft]);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const districts = useMemo(() => [...DISTRICT_OPTIONS], []);
  const roomTypes = useMemo(() => [...ROOM_TYPE_OPTIONS], []);

  // keep applied filters snapshot (để click->detail không stale)
  const appliedStateRef = useRef({
    search: "",
    priceApplied: PRICE_DEFAULT as [number, number],
    districtApplied: [] as string[],
    roomTypeApplied: [] as string[],
    moveApplied: null as "elevator" | "stairs" | null,
    sortApplied: "updated_desc" as SortMode,
    statusApplied: null as string | null,
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
  }, [
    search,
    priceApplied,
    districtApplied,
    roomTypeApplied,
    moveApplied,
    sortApplied,
    statusApplied,
  ]);

  // appliedRef để fetch dùng ngay
  const appliedRef = useRef<AppliedSnapshot>({
    search: "",
    minPrice: PRICE_DEFAULT[0],
    maxPrice: PRICE_DEFAULT[1],
    districts: [],
    roomTypes: [],
    move: null,
    sortMode: "updated_desc",
    status: null,
  });

  // ====== pagination cache ======
  const initCursor: string | UpdatedDescCursor | null =
    initialNextCursor && typeof initialNextCursor === "object"
      ? { id: initialNextCursor.id, updated_at: initialNextCursor.updated_at }
      : typeof initialNextCursor === "string"
        ? initialNextCursor
        : null;

  const [pages, setPages] = useState<any[][]>(() =>
    initialRooms?.length ? [initialRooms] : []
  );
  const pagesRef = useRef<any[][]>(initialRooms?.length ? [initialRooms] : []);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const [pageIndex, setPageIndex] = useState(0);
  const pageIndexRef = useRef(0);
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  const cursorsRef = useRef<(string | UpdatedDescCursor | null)[]>(
    initialRooms?.length ? [null, initCursor] : [null]
  );

  const [hasNext, setHasNext] = useState<boolean>(
    initialRooms?.length ? Boolean(initCursor) : true
  );
  const hasNextRef = useRef<boolean>(hasNext);
  useEffect(() => {
    hasNextRef.current = hasNext;
  }, [hasNext]);

  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const roomsToRender = useMemo(() => pages[pageIndex] ?? [], [pages, pageIndex]);

  // ====== URL helpers ======
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

  const replaceUrlShallow = useCallback(
    (nextQs: string) => {
      const currentQs = window.location.search.replace(/^\?/, "");
      if (nextQs === currentQs) return;

      const url = nextQs ? `${pathname}?${nextQs}` : pathname;
      window.history.replaceState(mergeHistoryState(), "", url);
    },
    [pathname]
  );

  const readUrlState = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);

    const q = sp.get(QS.q) ?? "";
    const min = parseNum(sp.get(QS.min));
    const max = parseNum(sp.get(QS.max));
    const d = parseList(sp.get(QS.d));
    const t = parseList(sp.get(QS.t));
    const m = (sp.get(QS.m) as "elevator" | "stairs" | null) || null;
    const s = (sp.get(QS.s) as SortMode) || "updated_desc";
    const p = parseNum(sp.get(QS.p));

    const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
    const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];
    const nextPage = Number.isFinite(p) && p >= 0 ? p : 0;

    const st = sp.get(QS.st) || null;
    const qs = canonicalQs(sp.toString());

    return { qs, q, minVal, maxVal, d, t, m, s, st, nextPage };
  }, []);

  // ====== RESET ALL ======
  const resetAllToDefault = useCallback(() => {
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

    pagesRef.current = [];
    setPages([]);

    cursorsRef.current = [null];
    setHasNext(true);

    setTotal(null);

    pageIndexRef.current = 0;
    setPageIndex(0);

    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);

    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      lastScrollTopRef.current = 0;
    });
  }, []);

  // ====== Reload (F5) => reset sạch ======
  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type !== "reload") return;

    const token = String(performance.timeOrigin);
    try {
      if (sessionStorage.getItem(HOME_RELOAD_GUARD_KEY) === token) return;
      sessionStorage.setItem(HOME_RELOAD_GUARD_KEY, token);
    } catch {}

    try {
      sessionStorage.removeItem(HOME_STATE_KEY);
      sessionStorage.removeItem(HOME_BACK_HINT_KEY);
      window.history.replaceState(mergeHistoryState({ __home: undefined }), "", pathname);
    } catch {}

    resetAllToDefault();
  }, [pathname, resetAllToDefault]);

  // ====== mount basic refs ======
  useEffect(() => {
    if (!homePathRef.current) homePathRef.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== Persist (sessionStorage) ======
  const persistRafRef = useRef<number | null>(null);
  const snapshotRef = useRef<PersistState | null>(null);

  useEffect(() => {
    navigatingAwayRef.current = false;
    snapshotRef.current = null;
  }, []);

  const buildPersistPayload = useCallback((): PersistState => {
    const qsNow = buildQs({
      q: search.trim(),
      min: priceApplied[0],
      max: priceApplied[1],
      d: districtApplied,
      t: roomTypeApplied,
      m: moveApplied,
      s: sortApplied,
      st: statusApplied,
      p: pageIndexRef.current,
    });

    return {
      qs: qsNow,
      total: typeof total === "number" ? total : null,

      search,
      priceApplied,
      districtApplied,
      roomTypeApplied,
      moveFilter: moveApplied,
      sortMode: sortApplied,
      statusFilter: statusApplied,

      pageIndex: pageIndexRef.current,
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
    moveApplied,
    sortApplied,
    statusApplied,
    total,
    hasNext,
  ]);

  const persistNow = useCallback(
    (force: boolean = false) => {
      if (!force && homePathRef.current && pathname !== homePathRef.current) return;

      try {
        if (force && navigatingAwayRef.current && snapshotRef.current) {
          sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(snapshotRef.current));
          return;
        }

        const payload = buildPersistPayload();

        if (force && !snapshotRef.current) snapshotRef.current = payload;

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
    if (navigatingAwayRef.current) return;

    if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
    persistRafRef.current = requestAnimationFrame(() => {
      persistRafRef.current = null;
      persistNow(false);
    });
  }, [persistNow]);

  useEffect(() => {
    return () => {
      if (persistRafRef.current) cancelAnimationFrame(persistRafRef.current);
      persistNow(true);
    };
  }, [persistNow]);

  useEffect(() => {
    const onPageHide = () => persistNow(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow(true);
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistNow]);

  // ====== fetch ======
  const fetchPageRef = useRef<(targetIndex: number) => Promise<void>>(async () => {});

  const fetchPage = useCallback(
    async (targetIndex: number) => {
      const myVersion = filtersVersionRef.current;

      // đã fetch (kể cả [])
      if (pagesRef.current[targetIndex] !== undefined) {
        setShowSkeleton(false);
        return;
      }

      const reqKey = `page::${targetIndex}`;
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

        if (myVersion !== filtersVersionRef.current) return;

        if (typeof res.total === "number") setTotal(res.total);

        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const r of res.data ?? []) {
          const id = String(r?.id ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          deduped.push(r);
        }

        const nextPages = [...pagesRef.current];
        nextPages[targetIndex] = deduped;

        pagesRef.current = nextPages;
        setPages(nextPages);

        cursorsRef.current[targetIndex + 1] = res.nextCursor ?? null;
        setHasNext(Boolean(res.nextCursor) && deduped.length === LIMIT);

        // prefetch page kế tiếp (idle)
        if (targetIndex !== pageIndexRef.current) return;
        if (!res.nextCursor || deduped.length !== LIMIT) return;

        const nextIdx = targetIndex + 1;
        const notFetchedYet = pagesRef.current[nextIdx] === undefined;
        const nextKey = `page::${nextIdx}`;
        if (!notFetchedYet || inFlightRef.current[nextKey]) return;

        const idle = (cb: () => void) => {
          const ric = (window as any).requestIdleCallback as
            | undefined
            | ((fn: any) => any);
          if (ric) ric(cb);
          else setTimeout(cb, 0);
        };

        idle(() => {
          if (myVersion !== filtersVersionRef.current) return;
          fetchPageRef.current(nextIdx);
        });
      } catch (e: any) {
        if (isVisible && myVersion === filtersVersionRef.current) {
          setFetchError(e?.message ?? "Fetch failed");
        }
      } finally {
        inFlightRef.current[reqKey] = false;

        const fetched = pagesRef.current[targetIndex] !== undefined;
        if (isVisible && fetched) {
          setLoading(false);
          setShowSkeleton(false);
        }
      }
    },
    [adminLevel]
  );

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const ensurePage = useCallback(async (target: number) => {
    const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
    for (let i = 0; i <= safeTarget; i++) {
      if (pagesRef.current[i] === undefined) {
        await fetchPageRef.current(i);
      }
    }
  }, []);

  const fetchPagePure = useCallback(async (targetIndex: number) => {
    await fetchPageRef.current(targetIndex);
  }, []);

  // ====== reset pagination ======
  const resetPagination = useCallback((keepPage: number = 0) => {
    if (!isOnHomeNow()) return;
    if (navigatingAwayRef.current) return;
    if (isRestoringRef.current || backRestoreLockRef.current) return;

    inFlightRef.current = {};
    pagesRef.current = [];
    setPages([]);

    pageIndexRef.current = keepPage;
    setPageIndex(keepPage);

    cursorsRef.current = [null];
    setHasNext(true);
    setFetchError("");
    setLoading(false);
    setShowSkeleton(true);
  }, []);

  // ====== apply ======
  const applyNow = useCallback(() => {
    if (isRestoringRef.current || backRestoreLockRef.current) return;

    const nextSearch = search.trim();

    const [minP, maxP] = (() => {
      const a = priceDraft[0],
        b = priceDraft[1];
      return a <= b ? [a, b] : [b, a];
    })();

    filtersVersionRef.current += 1;

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

    setAppliedSearch(nextSearch);
    setPriceApplied([minP, maxP]);
    setDistrictApplied(districtDraft);
    setRoomTypeApplied(roomTypeDraft);
    setMoveApplied(moveDraft);
    setSortApplied(sortModeRef.current);
    setStatusApplied(statusDraft);

    resetPagination(0);

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

    fetchPageRef.current(0);

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
  ]);

  const applySearchOnly = useCallback(() => {
    if (!isOnHomeNow()) return;
    if (navigatingAwayRef.current) return;
    if (isRestoringRef.current || backRestoreLockRef.current) return;

    const nextSearch = search.trim();
    if (nextSearch === (appliedRef.current.search ?? "").trim()) return;

    filtersVersionRef.current += 1;

    appliedRef.current = { ...appliedRef.current, search: nextSearch };
    setAppliedSearch(nextSearch);

    resetPagination(0);

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

  const applyImmediate = useCallback(() => {
    if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);
    applyTimerRef.current = null;
    applyNow();
  }, [applyNow]);

  // auto-apply search (debounce)
  useEffect(() => {
    if (!isOnHomeNow()) return;

    if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);

    if (navigatingAwayRef.current) return;
    if (backRestoreLockRef.current || isRestoringRef.current) return;

    if (skipNextAutoApplyRef.current) {
      skipNextAutoApplyRef.current = false;
      return;
    }

    const myGen = autoApplyGenRef.current;

    applyTimerRef.current = window.setTimeout(() => {
      if (myGen !== autoApplyGenRef.current) return;
      if (!isOnHomeNow()) return;
      if (navigatingAwayRef.current) return;
      if (backRestoreLockRef.current || isRestoringRef.current) return;
      applySearchOnly();
    }, 250);

    return () => {
      if (applyTimerRef.current) window.clearTimeout(applyTimerRef.current);
    };
  }, [search, applySearchOnly]);

  // ====== click -> detail snapshot ======
  const onPointerDownCapture = useCallback(
    (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      const a = target?.closest("a") as HTMLAnchorElement | null;
      if (!a) return;

      if (ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;

      const hrefAttr = a.getAttribute("href");
      if (!hrefAttr) return;
      if (hrefAttr.startsWith("#")) return;
      if (/^(https?:)?\/\//i.test(hrefAttr) || /^mailto:|^tel:/i.test(hrefAttr)) return;

      let url: URL;
      try {
        url = new URL(hrefAttr, window.location.origin);
      } catch {
        return;
      }
      if (!url.pathname.startsWith("/rooms/")) return;

      autoApplyGenRef.current += 1;

      const scrollTop = scrollRef.current?.scrollTop ?? 0;

      if (applyTimerRef.current) {
        window.clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }

      navigatingAwayRef.current = true;

      const st = appliedStateRef.current;

      const pRaw = parseNum(new URLSearchParams(window.location.search).get(QS.p));
      const pFromUrl = Number.isFinite(pRaw) && pRaw >= 0 ? pRaw : pageIndexRef.current;

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
          p: pFromUrl,
        }),

        search: st.search,
        priceApplied: st.priceApplied,
        districtApplied: st.districtApplied,
        roomTypeApplied: st.roomTypeApplied,
        moveFilter: st.moveApplied,
        sortMode: st.sortApplied,
        statusFilter: st.statusApplied,

        pageIndex: pFromUrl,
        scrollTop,
        cursors: cursorsRef.current,
        hasNext: hasNextRef.current,
      };

      writeBackHint(snapshot);
      persistNow(true);
    },
    [buildQs, persistNow]
  );

  useEffect(() => {
    const handler = (ev: Event) => onPointerDownCapture(ev as PointerEvent);
    document.addEventListener("pointerdown", handler, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handler, { capture: true } as any);
    };
  }, [onPointerDownCapture]);

  // ====== mount hydrate (restore by URL + hint) ======
  useEffect(() => {
    isRestoringRef.current = true;
    backRestoreLockRef.current = true;
    skipNextAutoApplyRef.current = true;

    if (applyTimerRef.current) {
      window.clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }

    const hint = readBackHint();
    const urlEmpty = window.location.search === "" || window.location.search === "?";

    const applyFiltersFromQs = (qs: string) => {
      const sp = new URLSearchParams(qs);

      const q = sp.get(QS.q) ?? "";
      const min = parseNum(sp.get(QS.min));
      const max = parseNum(sp.get(QS.max));
      const d = parseList(sp.get(QS.d));
      const t = parseList(sp.get(QS.t));
      const m = (sp.get(QS.m) as "elevator" | "stairs" | null) || null;
      const s = (sp.get(QS.s) as SortMode) || "updated_desc";
      const st = sp.get(QS.st) || null;

      const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
      const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];

      appliedRef.current = {
        search: q.trim(),
        minPrice: minVal,
        maxPrice: maxVal,
        districts: d ?? [],
        roomTypes: t ?? [],
        move: m ?? null,
        sortMode: s,
        status: st ?? null,
      };

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
    };

    // page source of truth
    const spUrl = new URLSearchParams(window.location.search);
    const pUrlRaw = parseNum(spUrl.get(QS.p));
    const pUrl = Number.isFinite(pUrlRaw) && pUrlRaw >= 0 ? pUrlRaw : 0;

    // Case 1: urlEmpty + hint -> restore qs before hydrate
    if (urlEmpty && hint?.qs) {
      replaceUrlShallow(hint.qs);
      applyFiltersFromQs(hint.qs);

      if (typeof hint.scrollTop === "number") {
        pendingScrollTopRef.current = hint.scrollTop;
      }

      const spAfter = new URLSearchParams(hint.qs);
      const pHintRaw = parseNum(spAfter.get(QS.p));
      const p = Number.isFinite(pHintRaw) && pHintRaw >= 0 ? pHintRaw : 0;

      pageIndexRef.current = p;
      setPageIndex(p);

      try {
        writeBackHint({
          qs: hint.qs,
          pageIndex: p,
          scrollTop: pendingScrollTopRef.current ?? 0,
          cursors: hint.cursors ?? null,
          hasNext: hint.hasNext ?? null,
        });
      } catch {}

      pagesRef.current = [];
      setPages([]);

      if (Array.isArray(hint.cursors) && hint.cursors.length) cursorsRef.current = hint.cursors;
      else cursorsRef.current = [null];

      if (typeof hint.hasNext === "boolean") setHasNext(hint.hasNext);
      else setHasNext(true);

      setShowSkeleton(true);

      requestAnimationFrame(() => {
        ensurePage(p).finally(() => {
          if (pendingScrollTopRef.current == null) {
            setShowSkeleton(false);
            backRestoreLockRef.current = false;
            isRestoringRef.current = false;
          }
        });
      });

      return;
    }

    // Case 2: hydrate by URL
    const { qs, q, minVal, maxVal, d, t, m, s, st } = readUrlState();

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

    setSearch(q ?? "");
    setAppliedSearch(q ?? "");

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

    pageIndexRef.current = pUrl;
    setPageIndex(pUrl);

    try {
      writeBackHint({ qs, pageIndex: pUrl, scrollTop: 0 });
    } catch {}

    pagesRef.current = [];
    setPages([]);
    cursorsRef.current = [null];
    setHasNext(true);
    setShowSkeleton(true);

    requestAnimationFrame(() => {
      ensurePage(pUrl).finally(() => {
        setShowSkeleton(false);
        backRestoreLockRef.current = false;
        isRestoringRef.current = false;
      });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== popstate restore ======
  const readHomeSnapshot = useCallback(() => {
    const src = readBackHint();
    if (!src) return null;

    return {
      scrollTop: typeof src.scrollTop === "number" ? src.scrollTop : 0,
      qs: typeof src.qs === "string" ? src.qs : "",
      cursors: Array.isArray(src.cursors) ? src.cursors : null,
      hasNext: typeof src.hasNext === "boolean" ? src.hasNext : null,
    };
  }, []);

  useEffect(() => {
    const onPop = () => {
      isRestoringRef.current = true;
      navigatingAwayRef.current = false;
      backRestoreLockRef.current = true;
      skipNextAutoApplyRef.current = true;

      if (applyTimerRef.current) {
        window.clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }

      const spUrl = new URLSearchParams(window.location.search);
      const pRaw = parseNum(spUrl.get(QS.p));
      const pFromUrl = Number.isFinite(pRaw) && pRaw >= 0 ? pRaw : 0;

      const snap = readHomeSnapshot();
      const qs = snap?.qs || window.location.search.replace(/^\?/, "");

      const sp = new URLSearchParams(qs);

      const q = sp.get(QS.q) ?? "";
      const min = parseNum(sp.get(QS.min));
      const max = parseNum(sp.get(QS.max));
      const d = parseList(sp.get(QS.d));
      const t = parseList(sp.get(QS.t));
      const m = (sp.get(QS.m) as "elevator" | "stairs" | null) || null;
      const s = (sp.get(QS.s) as SortMode) || "updated_desc";
      const st = sp.get(QS.st) || null;

      const minVal = Number.isFinite(min) ? min : PRICE_DEFAULT[0];
      const maxVal = Number.isFinite(max) ? max : PRICE_DEFAULT[1];

      appliedRef.current = {
        search: q.trim(),
        minPrice: minVal,
        maxPrice: maxVal,
        districts: d ?? [],
        roomTypes: t ?? [],
        move: m ?? null,
        sortMode: s,
        status: st ?? null,
      };

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

      pageIndexRef.current = pFromUrl;
      setPageIndex(pFromUrl);

      try {
        replaceUrlShallow(qs);
      } catch {}

      try {
        writeBackHint({
          qs,
          pageIndex: pFromUrl,
          scrollTop: snap?.scrollTop ?? 0,
          cursors: snap?.cursors ?? null,
          hasNext: snap?.hasNext ?? null,
        });
      } catch {}

      pagesRef.current = [];
      setPages([]);

      if (Array.isArray(snap?.cursors) && snap!.cursors!.length) {
        cursorsRef.current = snap!.cursors!;
      } else {
        cursorsRef.current = [null];
      }

      if (typeof snap?.hasNext === "boolean") setHasNext(snap!.hasNext!);
      else setHasNext(true);

      setShowSkeleton(true);

      requestAnimationFrame(() => {
        (async () => {
          await ensurePage(pFromUrl);
          pendingScrollTopRef.current = snap?.scrollTop ?? 0;
        })();
      });
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ensurePage, replaceUrlShallow, readHomeSnapshot]);

  // ====== apply pending scroll ======
  useEffect(() => {
    const pending = pendingScrollTopRef.current;
    if (pending == null) return;

    const el = scrollRef.current;
    if (!el) return;

    const maxScrollNow = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScrollNow <= 0) return;

    let tries = 0;
    const maxTries = 240;

    const finishRestore = () => {
      pendingScrollTopRef.current = null;
      lastScrollTopRef.current = el.scrollTop;

      backRestoreLockRef.current = false;
      isRestoringRef.current = false;
      setShowSkeleton(false);
    };

    const tryApply = () => {
      const el2 = scrollRef.current;
      if (!el2) return;

      const maxScroll = Math.max(0, el2.scrollHeight - el2.clientHeight);
      if (maxScroll < pending - 5 && tries < maxTries) {
        tries += 1;
        requestAnimationFrame(tryApply);
        return;
      }

      const target = Math.min(pending, maxScroll);
      el2.scrollTop = target;

      if (Math.abs(el2.scrollTop - target) > 5 && tries < maxTries) {
        tries += 1;
        requestAnimationFrame(tryApply);
        return;
      }

      finishRestore();
    };

    requestAnimationFrame(tryApply);

    const t = window.setTimeout(() => {
      if (pendingScrollTopRef.current == null) return;
      backRestoreLockRef.current = false;
      isRestoringRef.current = false;
      setShowSkeleton(false);
    }, 5000);

    return () => window.clearTimeout(t);
  }, [pageIndex, pages]);

  // ====== scroll persist ======
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;

    const onScroll = () => {
      if (raf) return;

      raf = requestAnimationFrame(() => {
        raf = 0;
        lastScrollTopRef.current = el.scrollTop;

        if (!navigatingAwayRef.current) {
          persistSoon();
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll as any);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [persistSoon]);

  // ====== next/prev ======
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
    writeBackHint({
      qs,
      pageIndex: next,
      scrollTop: scrollRef.current?.scrollTop ?? lastScrollTopRef.current,
      cursors: cursorsRef.current,
      hasNext: hasNextRef.current,
    });
    persistSoon();

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
    moveApplied,
    sortApplied,
    statusApplied,
    persistSoon,
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
    writeBackHint({
      qs,
      pageIndex: next,
      scrollTop: scrollRef.current?.scrollTop ?? lastScrollTopRef.current,
      cursors: cursorsRef.current,
      hasNext: hasNextRef.current,
    });
    persistSoon();

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
    moveApplied,
    sortApplied,
    statusApplied,
    persistSoon,
    fetchPagePure,
  ]);

  // ====== auth change ======
  const skipFirstAuthEffectRef = useRef(true);
  const lastSessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      const uid = data.session?.user?.id ?? null;
      lastSessionUserIdRef.current = uid;

      if (!data.session) setAdminLevel(0);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (skipFirstAuthEffectRef.current) {
        skipFirstAuthEffectRef.current = false;
        lastSessionUserIdRef.current = session?.user?.id ?? null;
        return;
      }

      const nextUid = session?.user?.id ?? null;
      const prevUid = lastSessionUserIdRef.current;
      lastSessionUserIdRef.current = nextUid;

      const userChanged = prevUid !== nextUid;
      if (!userChanged) return;

      if (!session) setAdminLevel(0);

      filtersVersionRef.current += 1;
      resetPagination(pageIndex);
      fetchPageRef.current(pageIndex);
      persistSoon();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [resetPagination, pageIndex, persistSoon]);

  const onSortChange = useCallback((v: SortMode) => {
    sortModeRef.current = v;
    setSortDraft(v);
  }, []);

  // ====== render ======
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
            <div className="relative z-[1000]">
              <div id="auth-anchor" />
            </div>
          </div>
        </header>

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
              onSortChange={onSortChange}
              onApply={applyImmediate}
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
        <Pagination
          goNext={goNext}
          goPrev={goPrev}
          hasNext={hasNext}
          loading={loading}
          total={typeof total === "number" ? total : undefined}
        />
      </div>

      <div id="portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
    </div>
  );
};

export default HomeClient;
