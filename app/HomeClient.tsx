"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import FilterBar, { SortMode } from "@/components/FilterBar";
import { trackVisitorEvent } from "@/lib/analytics/client";
import { changedCustomerFilters, customerFilterDetails, customerSearchDetails } from "@/lib/analytics/activity";
import RoomList from "@/components/RoomList";
import dynamic from "next/dynamic";
import Pagination from "@/components/Pagination";
import { fetchRooms, type UpdatedDescCursor } from "@/lib/fetchRooms";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";

import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";
import LogoIntroButton from "@/components/LogoIntroButton";
import { RoomModalLoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import HeaderNotifications from "@/components/HeaderNotifications";
import { ROOM_BADGES, type RoomBadge } from "@/lib/roomBadges";
import { getSavedRoomIds } from "@/lib/savedRooms";
import { normalizeRoomFeatures, matchesRoomFeatures, type RoomFeature } from "@/lib/rooms/features";
import { roomMatchesSearch, normalizeHomeSearchKeyword as normalizeSearchKeyword } from "@/lib/rooms/search";
import { DEFAULT_HOME_LIST_FILTERS, HOME_PRICE_DEFAULT as PRICE_DEFAULT, HIDDEN_ROOMS_ADMIN_EMAIL, readHomeListFilters, readHomeListPage, roomListFilterRpcParams, type HomeListFilters } from "@/lib/rooms/listFilters";
import { hasRecommendationFilters, isLastRecommendationPage, ROOM_RECOMMENDATIONS_ENABLED, type RecommendationFilters } from "@/lib/rooms/recommendations";

const RoomInquiryModal = dynamic(() => import("@/components/rooms/RoomInquiryModal"), { ssr: false });
const RoomRecommendations = dynamic(() => import("@/components/rooms/RoomRecommendations"));

type InitialProps = {
  initialRooms: any[];
  initialNextCursor: string | UpdatedDescCursor | null;
  initialAdminLevel: 0 | 1 | 2;
  initialUserId?: string | null;
  initialCanFilterHidden?: boolean;
  initialTotal?: number | null;
  initialError?: string;
  initialSavedView?: boolean;
  initialFilters?: HomeListFilters;
  initialPageIndex?: number;
  initialAnonSessionId?: string | null;
  initialAnonExpiresAt?: string | null;
  initialAnonExpired?: boolean;
  initialVipTokenPresent?: boolean;
  initialVipAccessTokenHash?: string | null;
  initialVipExpiresAt?: string | null;
  initialVipAdminPhone?: string | null;
  initialVipAdminName?: string | null;
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
  features: "features",
  s: "s",
  st: "st",
  badge: "badge",
  p: "p",
  c: "c", // ✅ cursor
} as const;

const LIST_SEP = ",";

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

function hasExplicitPriceFilter(qs: string) {
  const params = new URLSearchParams(qs.replace(/^\?/, ""));
  return readHomeListFilters(key => params.get(key)).priceFilterActive;
}

function makeFilterSigValue(args: {
  search: string;
  priceApplied: [number, number];
  priceFilterActive?: boolean;
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  featureFilters?: RoomFeature[];
  sortMode: SortMode;
  statusFilter: string | null;
  badgeFilter?: RoomBadge | null;
}) {
  return JSON.stringify([args.search.trim(), roomListFilterRpcParams({
    minPrice: args.priceFilterActive ? Math.min(...args.priceApplied) : null,
    maxPrice: args.priceFilterActive ? Math.max(...args.priceApplied) : null,
    districts: args.selectedDistricts,
    roomTypes: args.selectedRoomTypes,
    move: args.moveFilter,
    petPolicies: args.petFilters,
    contractTerms: args.termFilters,
    featureFilters: args.featureFilters,
    sortMode: args.sortMode,
    status: args.statusFilter,
    badge: args.badgeFilter,
  })]);
}

function filterSigForQuery(qs: string) {
  const params = new URLSearchParams(qs);
  return makeFilterSigValue(readHomeListFilters(key => params.get(key)));
}

const HOME_BACK_HINT_KEY = "HOME_BACK_HINT_V1";
const HOME_BACK_HINT_TTL = 15 * 60 * 1000; // 15 phút

// ✅ BACK SNAPSHOT (cấu trúc logic cũ để giữ page/scroll khi back từ detail)
const HOME_BACK_SNAPSHOT_KEY = "HOME_BACK_SNAPSHOT_V2";
const HOME_BACK_SNAPSHOT_TTL = 15 * 60 * 1000;

const HOME_STATE_KEY = "HOME_STATE_V3"; // giữ nguyên
const HOME_STATE_LITE_PREFIX = "HOME_STATE_LITE_V2::"; // ✅ per-qS key
const HOME_STATE_LITE_TTL = 30 * 60 * 1000; // 30 phút (đồng bộ V2)
// ✅ nếu có thay đổi dữ liệu quan trọng từ tab khác (/admin) thì Home bỏ restore cache cũ
const HOME_DIRTY_KEY = "HOME_DIRTY_V1";

const VIP_ACCESS_KEY = "VIP_ACCESS_V1";
const VIP_PARAM_KEY = "vip";

type ListingSnapshotKey = { filterSig: string; viewer: string };

function matchesListingSnapshot(snapshot: ListingSnapshotKey, qs: string, viewer: string) {
  return snapshot.viewer === viewer && snapshot.filterSig === filterSigForQuery(qs);
}

function readVipAccess() {
  if (typeof window === "undefined") return false;

  try {
    const raw = localStorage.getItem(VIP_ACCESS_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt ?? 0);

    if (!expiresAt || Date.now() >= expiresAt) {
      localStorage.removeItem(VIP_ACCESS_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

type BackSnapshot = ListingSnapshotKey & {
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
  featureFilters?: RoomFeature[];
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

type PersistState = ListingSnapshotKey & {
  qs: string;
  total: number | null;
  search: string;
  priceApplied: [number, number];
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  featureFilters?: RoomFeature[];
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

type PersistLiteState = ListingSnapshotKey & {
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
  featureFilters?: RoomFeature[];
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
  initialUserId = null,
  initialCanFilterHidden = false,
  initialTotal,
  initialError = "",
  initialSavedView = false,
  initialFilters = DEFAULT_HOME_LIST_FILTERS,
  initialPageIndex = 0,
  initialAnonSessionId = null,
  initialAnonExpiresAt = null,
  initialAnonExpired = false,
  initialVipTokenPresent = false,
  initialVipAccessTokenHash = null,
  initialVipExpiresAt = null,
  initialVipAdminPhone = null,
  initialVipAdminName = null,
}: InitialProps) => {

  const pathname = usePathname();
  const [initialFilterSig] = useState(() => makeFilterSigValue(initialFilters));
  const [initialPageUsable] = useState(() => {
    if (initialPageIndex !== 0) return false;
    if (typeof window === "undefined") return true;
    const params = new URLSearchParams(window.location.search);
    return initialFilterSig === filterSigForQuery(window.location.search) && readHomeListPage(key => params.get(key)).nextPage === 0;
  });
  const [isSavedView, setIsSavedView] = useState(initialSavedView);
  const [savedRoomIds, setSavedRoomIds] = useState<string[]>([]);
  const [savedRooms, setSavedRooms] = useState<any[]>([]);
  const [savedRoomsLoading, setSavedRoomsLoading] = useState(false);
  const [savedRoomsError, setSavedRoomsError] = useState("");
  const savedLoadVersionRef = useRef(0);

  useEffect(() => {
    const refreshSavedRooms = async () => {
      const ids = Array.from(new Set(getSavedRoomIds().map(String)));
      setSavedRoomIds(ids);
      const savedIdSet = new Set(ids);
      setSavedRooms((current) => current.filter((room) => savedIdSet.has(String(room.id))));
      const version = ++savedLoadVersionRef.current;
      setSavedRoomsError("");
      if (!ids.length) {
        setSavedRooms([]);
        setSavedRoomsLoading(false);
        return;
      }
      if (!isSavedView) return;

      setSavedRoomsLoading(true);
      try {
        const batches: string[][] = [];
        for (let offset = 0; offset < ids.length; offset += 50) batches.push(ids.slice(offset, offset + 50));
        const loaded: any[] = [];
        for (let offset = 0; offset < batches.length; offset += 3) {
          const results = await Promise.all(batches.slice(offset, offset + 3).map(async (batch) => {
            const response = await fetch(`/api/saved-rooms?ids=${encodeURIComponent(batch.join(","))}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Không thể tải phòng đã lưu.");
            const json = await response.json();
            return Array.isArray(json.data) ? json.data : [];
          }));
          loaded.push(...results.flat());
          if (version !== savedLoadVersionRef.current) return;
        }
        const byId = new Map(loaded.map((room) => [String(room.id), room]));
        let cachedById = new Map<string, any>();
        try {
          const rawCache = sessionStorage.getItem("saved_rooms_cache");
          const cachedRooms = rawCache ? JSON.parse(rawCache) : [];
          if (Array.isArray(cachedRooms)) cachedById = new Map(cachedRooms.filter((room) => room?.id).map((room) => [String(room.id), room]));
        } catch {}
        setSavedRooms(ids.map((id) => {
          const loadedRoom = byId.get(id);
          const cachedRoom = cachedById.get(id);
          return loadedRoom ? { ...cachedRoom, ...loadedRoom, room_detail: loadedRoom.room_detail ?? cachedRoom?.room_detail } : null;
        }).filter(Boolean));
      } catch {
        if (version === savedLoadVersionRef.current) {
          setSavedRooms([]);
          setSavedRoomsError("Không thể tải phòng đã lưu. Vui lòng thử lại.");
        }
      } finally {
        if (version === savedLoadVersionRef.current) setSavedRoomsLoading(false);
      }
    };

    const onSavedChange = () => { void refreshSavedRooms(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "saved_room_ids") onSavedChange();
    };
    void refreshSavedRooms();
    window.addEventListener("saved-rooms-changed", onSavedChange);
    window.addEventListener("storage", onStorage);
    return () => {
      savedLoadVersionRef.current += 1;
      window.removeEventListener("saved-rooms-changed", onSavedChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [isSavedView]);

  useEffect(() => {
    document.documentElement.dataset.homeHydrated = "true";
    window.dispatchEvent(new Event("home:hydrated"));

    return () => {
      delete document.documentElement.dataset.homeHydrated;
    };
  }, []);


  const homePathRef = useRef<string>("");      // pathname của Home lúc mount
  const listQsRef = useRef<string>("");        // qs ổn định của list
  const didRestoreFromStorageRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);
  const [badgeFilter, setBadgeFilter] = useState<RoomBadge | null>(initialFilters.badgeFilter);
  const [generalInquiryOpen, setGeneralInquiryOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(
    initialPageUsable && typeof initialTotal === "number" ? initialTotal : null
  );
  const cursorStackRef = useRef<(UrlCursor)[]>([]);
const currentCursorRef = useRef<UrlCursor>(null);
const prevMoveFilterRef = useRef<"elevator" | "stairs" | null>(null);
  const replaceStateLastTsRef = useRef(0);
  const replaceStateTimerRef = useRef<number | null>(null);



    // ================== ROLE ==================
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(initialAdminLevel);
  const [currentUserId, setCurrentUserId] = useState(initialUserId);
  const [canFilterHidden, setCanFilterHidden] = useState(initialCanFilterHidden);
  const [currentAdminPhone, setCurrentAdminPhone] = useState<string | null>(null);
  const [currentAdminName, setCurrentAdminName] = useState<string | null>(null);

  // ================== ANON LOCK ==================
const [isAnonLocked, setIsAnonLocked] = useState(initialAnonExpired && !initialUserId && !initialVipAccessTokenHash);
const [isLoggedIn, setIsLoggedIn] = useState(Boolean(initialUserId));
const [authResolving, setAuthResolving] = useState(false);
const authResolvingRef = useRef(false);
const [hasVipAccess, setHasVipAccess] = useState(Boolean(initialVipAccessTokenHash && initialVipExpiresAt));
const [vipValidationPending, setVipValidationPending] = useState(initialVipTokenPresent);
const vipAccessTokenHashRef = useRef<string | null>(initialVipAccessTokenHash);

const lockTimerRef = useRef<number | null>(null);
const vipTimerRef = useRef<number | null>(null);

const [vipAdminPhone, setVipAdminPhone] = useState<string | null>(initialVipAdminPhone);
const [vipAdminName, setVipAdminName] = useState<string | null>(initialVipAdminName);

  // ================== FILTER ==================

    const [priceDraft, setPriceDraft] = useState(initialFilters.priceApplied);
  const [priceApplied, setPriceApplied] = useState(initialFilters.priceApplied);
  const [priceFilterActive, setPriceFilterActive] = useState(initialFilters.priceFilterActive);
  const setPriceAppliedFromUser = useCallback<
    React.Dispatch<React.SetStateAction<[number, number]>>
  >((next) => {
    setPriceFilterActive(true);
    setPriceApplied(next);
  }, []);
  const didHardReloadRef = useRef(false);
  const [minPriceApplied, maxPriceApplied] = useMemo(() => {
    const a = priceApplied[0];
    const b = priceApplied[1];
    return a <= b ? [a, b] : [b, a];
  }, [priceApplied]);

  const districts = useMemo(() => [...DISTRICT_OPTIONS], []);
  const roomTypes = useMemo(() => [...ROOM_TYPE_OPTIONS], []);

  const filterApplyTimerRef = useRef<number | null>(null);
  const [selectedDistricts, setSelectedDistricts] = useState(initialFilters.selectedDistricts);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState(initialFilters.selectedRoomTypes);
  const [moveFilter, setMoveFilter] = useState(initialFilters.moveFilter);
  const [petFilters, setPetFilters] = useState(initialFilters.petFilters);
const [termFilters, setTermFilters] = useState(initialFilters.termFilters);
const [featureFilters, setFeatureFilters] = useState(initialFilters.featureFilters);
  const [sortMode, setSortMode] = useState(initialFilters.sortMode);
  const [openingRoomId, setOpeningRoomId] = useState<string | null>(null);
  const lastFilterSigRef = useRef(initialFilterSig);
  const prevAppliedSearchRef = useRef(initialFilters.search);
  const previousCustomerFilters = useRef<ReturnType<typeof customerFilterDetails> | null>(null);
  const pendingRestoredFilterSigRef = useRef<string | null>(null);
  const [search, setSearch] = useState(initialFilters.search);
  const [appliedSearch, setAppliedSearch] = useState(initialFilters.search);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

 const armRestoredFilterSig = useCallback((next: {
  search: string;
  priceApplied: [number, number];
  priceFilterActive?: boolean;
  selectedDistricts: string[];
  selectedRoomTypes: string[];
  moveFilter: "elevator" | "stairs" | null;
  petFilters: ("cat" | "dog" | "nopet")[];
  termFilters: ("short" | "long")[];
  featureFilters?: RoomFeature[];
  sortMode: SortMode;
  statusFilter: string | null;
  badgeFilter?: RoomBadge | null;
}) => {
  const restoredPriceFilterActive =
    next.priceFilterActive ??
    (typeof window !== "undefined" &&
      hasExplicitPriceFilter(window.location.search));
  setPriceFilterActive(restoredPriceFilterActive);
  const sig = makeFilterSigValue({
    ...next,
    priceFilterActive: restoredPriceFilterActive,
  });
  setBadgeFilter(next.badgeFilter ?? null);
  setAppliedSearch(next.search);
  pendingRestoredFilterSigRef.current = sig;
  lastFilterSigRef.current = sig;
  prevAppliedSearchRef.current = next.search.trim();
}, []);

const filterSig = useMemo(() => makeFilterSigValue({
  search: appliedSearch, priceApplied, priceFilterActive, selectedDistricts, selectedRoomTypes,
  moveFilter, petFilters, termFilters, featureFilters, sortMode, statusFilter, badgeFilter,
}), [
  appliedSearch,
  priceFilterActive,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
  sortMode,
  statusFilter,
  badgeFilter,
]);

// ================== VIP State ==================
const recommendationFilters: RecommendationFilters = {
  search: appliedSearch, priceFilterActive,
  minPrice: priceFilterActive ? minPriceApplied : null,
  maxPrice: priceFilterActive ? maxPriceApplied : null,
  districts: selectedDistricts, roomTypes: selectedRoomTypes, move: moveFilter,
  petPolicies: petFilters, contractTerms: termFilters, features: featureFilters,
  status: statusFilter, badge: badgeFilter, sortMode,
};
useEffect(() => {
  if (typeof window === "undefined") return;

  let cancelled = false;

  const clearVipTimer = () => {
    if (vipTimerRef.current) {
      window.clearTimeout(vipTimerRef.current);
      vipTimerRef.current = null;
    }
  };

  const clearVipAccess = () => {
    if (cancelled) return;

    vipAccessTokenHashRef.current = null;
    setHasVipAccess(false);
    setVipAdminPhone(null);
    setVipAdminName(null);
  };

  const activateVip = (payload: {
    expiresAt: number;
    creatorAdminPhone?: string | null;
    creatorAdminName?: string | null;
    tokenHash?: string | null;
  }, persist: boolean) => {
    const expiresAt = Number(payload.expiresAt ?? 0);
    const tokenHash = String(payload.tokenHash ?? "").trim();
    if (!tokenHash || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

    const vipPhone = String(payload.creatorAdminPhone ?? "").trim() || null;
    const vipName = String(payload.creatorAdminName ?? "").trim() || null;

    vipAccessTokenHashRef.current = tokenHash;
    if (persist) {
      localStorage.setItem(VIP_ACCESS_KEY, JSON.stringify({
        expiresAt,
        savedAt: Date.now(),
        creatorAdminPhone: vipPhone,
        creatorAdminName: vipName,
        tokenHash,
      }));
    }

    if (cancelled) return true;
    setHasVipAccess(true);
    setIsAnonLocked(false);
    setGeneralInquiryOpen(false);
    setVipAdminPhone(vipPhone);
    setVipAdminName(vipName);

    clearVipTimer();
    vipTimerRef.current = window.setTimeout(() => {
      localStorage.removeItem(VIP_ACCESS_KEY);
      clearVipAccess();
    }, Math.min(expiresAt - Date.now(), 2_147_000_000));
    return true;
  };

  const applyStoredVip = () => {
    try {
      const raw = localStorage.getItem(VIP_ACCESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          expiresAt?: number;
          creatorAdminPhone?: string | null;
          creatorAdminName?: string | null;
          tokenHash?: string | null;
        };
        if (activateVip({ ...parsed, expiresAt: Number(parsed.expiresAt ?? 0) }, false)) return true;
        localStorage.removeItem(VIP_ACCESS_KEY);
      }

      const initialExpiresAtMs = new Date(initialVipExpiresAt ?? "").getTime();
      if (activateVip({
        expiresAt: initialExpiresAtMs,
        creatorAdminPhone: initialVipAdminPhone,
        creatorAdminName: initialVipAdminName,
        tokenHash: initialVipAccessTokenHash,
      }, true)) return true;

      clearVipAccess();
      return false;
    } catch {
      localStorage.removeItem(VIP_ACCESS_KEY);
      clearVipAccess();
      return false;
    }
  };

  const validateVipFromUrl = async () => {
    const sp = new URLSearchParams(window.location.search);
    const token = sp.get(VIP_PARAM_KEY)?.trim();

    // Khôi phục tức thời để UI không nhấp nháy, sau đó server kiểm tra lại
    // expires_at/revoked_at của đúng Link Giỏ hàng này.
    const hadStoredVip = applyStoredVip();
    if (!token && !hadStoredVip) {
      setVipValidationPending(false);
      return;
    }

    try {
      const res = await fetch("/api/vip/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(token ? { token } : {}),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.valid || !json?.expiresAt) {
        localStorage.removeItem(VIP_ACCESS_KEY);
        clearVipAccess();
        return;
      }

      const expiresAtMs = new Date(json.expiresAt).getTime();
      if (!activateVip({
        expiresAt: expiresAtMs,
        creatorAdminPhone: json.creatorAdminPhone,
        creatorAdminName: json.creatorAdminName,
        tokenHash: json.tokenHash,
      }, true)) {
        localStorage.removeItem(VIP_ACCESS_KEY);
        clearVipAccess();
        return;
      }

      if (token) {
        // Link vừa mở lần đầu: tải lại danh sách với quyền VIP đã được DB xác thực.
        resetPagination(0);
        queueMicrotask(() => fetchPageRef.current(0));
      }
    } catch (error) {
      console.error("[VIP VALIDATE]", error);

      // Nếu request tạm lỗi, giữ quyền VIP cũ nếu nó vẫn còn hạn.
      applyStoredVip();
    } finally {
      setVipValidationPending(false);
      const next = new URLSearchParams(window.location.search);
      next.delete(VIP_PARAM_KEY);

      const nextQs = next.toString();
      const nextUrl = nextQs ? `${pathname}?${nextQs}` : pathname;

      window.history.replaceState(window.history.state, "", nextUrl);
    }
  };

  void validateVipFromUrl();

  return () => {
    cancelled = true;
    clearVipTimer();
  };
}, [
  pathname,
  initialVipAccessTokenHash,
  initialVipExpiresAt,
  initialVipAdminPhone,
  initialVipAdminName,
]);

// Admin đăng nhập vẫn dùng thông tin tài khoản hiện tại như logic cũ.
useEffect(() => {
  let cancelled = false;

  const loadCurrentAdminProfile = async () => {
    if (!currentUserId) {
      setCurrentAdminPhone(null);
      setCurrentAdminName(null);
      return;
    }

    try {
      const response = await fetch("/api/admin/me", {
        cache: "no-store",
      });

      if (cancelled) return;

      if (!response.ok) {
        setCurrentAdminPhone(null);
        setCurrentAdminName(null);
        return;
      }

      const data = (await response.json()) as {
        phone?: string | null;
        full_name?: string | null;
      };

      setCurrentAdminPhone(String(data.phone ?? "").trim() || null);
      setCurrentAdminName(String(data.full_name ?? "").trim() || null);
    } catch {
      if (cancelled) return;

      setCurrentAdminPhone(null);
      setCurrentAdminName(null);
    }
  };

  void loadCurrentAdminProfile();

  return () => {
    cancelled = true;
  };
}, [currentUserId]);

// ================== PAGINATION (cache) ==================
 const initCursor: string | UpdatedDescCursor | null = !initialPageUsable ? null :
  initialNextCursor && typeof initialNextCursor === "object"
    ? {
        id: String((initialNextCursor as any).id),
        updated_at: String((initialNextCursor as any).updated_at),
        created_at: String(
          (initialNextCursor as any).created_at ?? (initialNextCursor as any).updated_at
        ),
        search_score:
          Number.isFinite(Number((initialNextCursor as any).search_score))
            ? Number((initialNextCursor as any).search_score)
            : undefined,
      }
    : typeof initialNextCursor === "string"
      ? initialNextCursor
      : null;

  // ✅ IMPORTANT: phân biệt "chưa fetch" (undefined) vs "đã fetch nhưng rỗng" ([])
  const [pages, setPages] = useState<any[][]>(() => initialPageUsable ? [initialRooms ?? []] : []);
  const pagesRef = useRef(pages);
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
    [null, initCursor]
  );

  const [hasNext, setHasNext] = useState<boolean>(
    Boolean(initCursor)
  );
   const didHydrateOnceRef = useRef(false);
   const didApplyBackOnceRef = useRef(false);
    const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(!initialPageUsable && !initialSavedView);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(initialPageUsable ? initialError : "");
  const fetchPageRef = useRef<(targetIndex: number) => void>(() => {});
 const isReloadRef = useRef<boolean>(false);

  const requestIdRef = useRef(0);
  const inFlightRef = useRef<Record<string, boolean>>({});

  // ================== GUARDS ==================
  const hydratingFromUrlRef = useRef(false);
  const filtersVersionRef = useRef(0); // "đợt filter" để drop response cũ
  const pendingUrlFiltersRef = useRef<{
  search: string;
  min?: number;
  max?: number;
  priceFilterActive: boolean;
  districts: string[];
  roomTypes: string[];
  move: "elevator" | "stairs" | null;
  pets: ("cat" | "dog" | "nopet")[];
  terms: ("short" | "long")[];
  features?: RoomFeature[];
  sort: SortMode;
  status: string | null;
  badge: RoomBadge | null;
} | null>(null);

const pageIndexRef = useRef(0);
useLayoutEffect(() => {
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

const saveScrollToHistory = useCallback((immediate = false) => {
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
  if (!immediate && now - replaceStateLastTsRef.current < MIN_INTERVAL_MS) {
    if (replaceStateTimerRef.current) return;

    replaceStateTimerRef.current = window.setTimeout(() => {
      replaceStateTimerRef.current = null;
      doReplace();
    }, MIN_INTERVAL_MS);

    return;
  }

  if (replaceStateTimerRef.current) {
    clearTimeout(replaceStateTimerRef.current);
    replaceStateTimerRef.current = null;
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

  const savedFilteredRooms = useMemo(() => {
    const query = normalizeSearchKeyword(appliedSearch, adminLevel === 1 || adminLevel === 2);
      const needle = query;
    const filtered = savedRooms.filter((room) => {
      if (needle && !roomMatchesSearch(room, needle, adminLevel === 1 || adminLevel === 2)) return false;

      const price = Number(room.price ?? room.price_month ?? room.monthly_price);
      if (priceFilterActive && (!Number.isFinite(price) || price < minPriceApplied || price > maxPriceApplied)) return false;
      const district = String(room.district ?? "").trim();
      if (selectedDistricts.length && !selectedDistricts.some((selected) => {
        const numericDistrict = selected.match(/\d+/)?.[0];
        return district === selected || (numericDistrict !== undefined && district === numericDistrict);
      })) return false;
      if (selectedRoomTypes.length && !selectedRoomTypes.some((type) => {
        const roomType = String(room.room_type ?? "").trim();
        return roomType === type || (type === "1 Phòng ngủ" && roomType === "1PN") || (type === "2 Phòng ngủ" && roomType === "2PN");
      })) return false;
      if (statusFilter && !statusFilter.split(",").includes(String(room.status ?? ""))) return false;
      if (badgeFilter && !Array.isArray(room.badges) || (badgeFilter && !room.badges.includes(badgeFilter))) return false;

      const details = room.room_detail && typeof room.room_detail === "object" ? room.room_detail : {};
      if (moveFilter === "elevator" && details.has_elevator !== true) return false;
      if (moveFilter === "stairs" && details.has_stairs !== true) return false;
      if (petFilters.length) {
        const allowed = petFilters.some((pet) => pet === "cat"
          ? room.allow_cat === true
          : pet === "dog"
            ? room.allow_dog === true
            : room.no_pet === true);
        if (!allowed) return false;
      }
      if (!matchesRoomFeatures(details, featureFilters)) return false;
      if (termFilters.length) {
        const terms = termFilters.some((term) => term === "short"
          ? room.short_term === true
          : room.long_term !== false);
        if (!terms) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortMode === "price_asc" || sortMode === "price_desc") {
        const pa = Number(a.price ?? a.price_month ?? a.monthly_price);
        const pb = Number(b.price ?? b.price_month ?? b.monthly_price);
        const aHasPrice = Number.isFinite(pa);
        const bHasPrice = Number.isFinite(pb);
        if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
        if (!aHasPrice || !bHasPrice) return 0;
        return sortMode === "price_asc" ? pa - pb : pb - pa;
      }
      return String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? ""));
    });
  }, [savedRooms, appliedSearch, priceFilterActive, minPriceApplied, maxPriceApplied, selectedDistricts,
    selectedRoomTypes, statusFilter, badgeFilter, moveFilter, petFilters, termFilters, featureFilters, adminLevel, sortMode]);

  const savedPageCount = Math.max(1, Math.ceil(savedFilteredRooms.length / LIMIT));
  const savedPageIndex = Math.min(pageIndex, savedPageCount - 1);
  const savedPageRooms = useMemo(() =>
    savedFilteredRooms.slice(savedPageIndex * LIMIT, (savedPageIndex + 1) * LIMIT),
    [savedFilteredRooms, savedPageIndex]
  );
  const visibleRooms = isSavedView ? savedPageRooms : roomsToRender;
  const visibleHasNext = isSavedView ? savedPageIndex + 1 < savedPageCount : hasNext;
  const showRecommendations = ROOM_RECOMMENDATIONS_ENABLED && hasRecommendationFilters(recommendationFilters)
    && !isSavedView && sortMode !== "hidden" && !loading && !isRefreshing && !showSkeleton && !fetchError && search === appliedSearch
    && isLastRecommendationPage(pageIndex, displayPageIndex, total, visibleHasNext, LIMIT);

  useEffect(() => {
    if (!isSavedView) return;
    if (pageIndex !== savedPageIndex) {
      setPageIndex(savedPageIndex);
      setDisplayPageIndex(savedPageIndex);
      pageIndexRef.current = savedPageIndex;
      const params = new URLSearchParams(window.location.search);
      params.set(QS.p, String(savedPageIndex));
      params.delete(QS.c);
      window.history.replaceState(window.history.state, "", `${pathname}?${params.toString()}`);
    }
    setTotal(savedFilteredRooms.length);
  }, [isSavedView, pageIndex, savedPageIndex, savedFilteredRooms.length, pathname]);

  // ================== SAVED ==================
 useEffect(() => {
  if (!Array.isArray(roomsToRender) || roomsToRender.length === 0) return;

  try {
    const raw = sessionStorage.getItem("saved_rooms_cache");
    const oldRooms = raw ? JSON.parse(raw) : [];

    const map = new Map<string, any>();

    if (Array.isArray(oldRooms)) {
      oldRooms.forEach((room) => {
        if (room?.id) map.set(room.id, room);
      });
    }

    roomsToRender.forEach((room) => {
      if (room?.id) map.set(room.id, room);
    });

    sessionStorage.setItem(
      "saved_rooms_cache",
      JSON.stringify(Array.from(map.values()))
    );
  } catch {}
}, [roomsToRender]);

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
    features?: RoomFeature[];
    s?: SortMode;
    st?: string | null;
    badge?: RoomBadge | null;
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
    params.delete("rt");
    setOrDel(QS.m, next.m ? next.m : null);
    setOrDel(QS.pet, next.pet?.length ? toListParam(next.pet) : null);
    setOrDel(QS.term, next.term?.length ? toListParam(next.term) : null);
    setOrDel(QS.features, next.features?.length ? toListParam(next.features) : null);
    setOrDel(QS.s, next.s ? next.s : null);

    // ✅ URLSearchParams tự encode
    setOrDel(QS.st, next.st ? next.st : null);
    if (next.badge !== undefined) setOrDel(QS.badge, next.badge);

    setOrDel(QS.p, typeof next.p === "number" ? String(next.p) : null);

    // ✅ cursor in URL: base64url(JSON)
    setOrDel(QS.c, next.c ? encodeCursor(next.c) : null);

    return params.toString();
  },
  []
);

function canonicalQs(qs: string) {
  const params = new URLSearchParams(qs);
  params.sort();
  return params.toString();
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
    min: priceFilterActive ? minPriceApplied : undefined,
    max: priceFilterActive ? maxPriceApplied : undefined,
    d: selectedDistricts,
    t: selectedRoomTypes,
    m: moveFilter,
    pet: petFilters,
    term: termFilters,
    features: featureFilters,
    s: sortMode,
    st: statusFilter,
    badge: badgeFilter,
    p: nextPageIndex,
  });
    replaceUrlShallow(nextQs);
  },
  [
  appliedSearch,
  minPriceApplied,
  maxPriceApplied,
  priceFilterActive,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
  sortMode,
  statusFilter,
  badgeFilter,
  buildQs,
  replaceUrlShallow,
]
);

const readUrlState = useCallback(() => {
  const sp = new URLSearchParams(window.location.search);
  const get = (key: string) => sp.get(key);
  const filters = readHomeListFilters(get);
  return {
    qs: canonicalQs(sp.toString()),
    filters,
    q: filters.search,
    minVal: filters.priceApplied[0],
    maxVal: filters.priceApplied[1],
    priceFilterActive: filters.priceFilterActive,
    d: filters.selectedDistricts,
    t: filters.selectedRoomTypes,
    m: filters.moveFilter,
    pet: filters.petFilters,
    term: filters.termFilters,
    features: filters.featureFilters,
    s: filters.sortMode,
    st: filters.statusFilter,
    badge: filters.badgeFilter,
    ...readHomeListPage(get),
  };
}, []);

// ================== DEBUG OVERLAY (Patch D1) ==================
const debugEnabled = useMemo(() => {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get("debug") === "1";
}, []);

const debugLastWriteRef = useRef<DebugWrite>({});

// ✅ DEBUG PAGINATION: hiện kết quả fetch trực tiếp trên UI khi URL có ?debug=1
type PageDebugItem = {
  at: string;
  event: string;
  targetIndex?: number;
  pageIndex?: number;
  displayPageIndex?: number;
  total?: number | null;
  rawLen?: number;
  dedupedLen?: number;
  limit?: number;
  cursorUsedForThisPage?: any;
  nextCursor?: any;
  sortMode?: string;
  hasNextBefore?: boolean;
  finalHasNext?: boolean;
  cachedState?: string;
  filterSig?: string;
  note?: string;

  // ✅ DEBUG SORT GIÁ
  pagePriceMin?: number | null;
  pagePriceMax?: number | null;
  firstRows?: any[];
  lastRows?: any[];
};

const [pageDebug, setPageDebug] = useState<PageDebugItem | null>(null);
const [pageDebugHistory, setPageDebugHistory] = useState<PageDebugItem[]>([]);

const pushPageDebug = useCallback(
  (item: PageDebugItem) => {
    if (!debugEnabled) return;

    setPageDebug(item);

    setPageDebugHistory((prev) => {
      const next = [item, ...prev];
      return next.slice(0, 5);
    });
  },
  [debugEnabled]
);

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


  // ================== PERSIST (sessionStorage) ==================
  const persistRafRef = useRef<number | null>(null);

  const liteKeyForQs = useCallback((qsRaw: string) => {
  const c = canonicalQs(qsRaw || "");
  return `${HOME_STATE_LITE_PREFIX}${c}`;
}, []);

const listingViewer = `${adminLevel}:${currentUserId ?? ""}`;
const canPersistListing = useCallback((qs: string) => (
  !authResolvingRef.current && search === appliedSearch &&
  filterSig === lastFilterSigRef.current && filterSig === filterSigForQuery(qs)
), [search, appliedSearch, filterSig]);

const writeLiteNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;
  if (persistBlockedRef.current) return;
  if (homePathRef.current && pathname !== homePathRef.current) return;

  // ✅ source-of-truth: lấy qs từ URL thật (không dùng listQsRef)
  const qsRaw = window.location.search.replace(/^\?/, "");
  if (!canPersistListing(qsRaw)) return;
  listQsRef.current = qsRaw;

  const qs = canonicalQs(qsRaw);

const payload: PersistLiteState = {
  qs,
  filterSig,
  viewer: listingViewer,
  total: typeof total === "number" ? total : null,

  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
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
  canPersistListing,
  filterSig,
  listingViewer,
  hasNext,
  liteKeyForQs,
  moveFilter,
  petFilters,
  termFilters,
  featureFilters,
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
      const parsed = JSON.parse(raw) as PersistLiteState;

      const ttlOk = !!parsed?.ts && Date.now() - parsed.ts < 30 * 60 * 1000;
      const qsOk = canonicalQs(parsed?.qs || "") === canonicalQs(urlQs || "");
      if (!ttlOk || !qsOk || !matchesListingSnapshot(parsed, urlQs, listingViewer)) return null;

      return parsed;
    } catch {
      return null;
    }
  },
  [liteKeyForQs, listingViewer]
);

const writeBackSnapshotNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;

  const qsRaw = window.location.search;
  if (!canPersistListing(qsRaw)) return;
  const nextQs = canonicalQs(qsRaw);

  const payload: BackSnapshot = {
  qs: nextQs,
  filterSig,
  viewer: listingViewer,

  total: typeof total === "number" ? total : null,
  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
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
  canPersistListing,
  filterSig,
  listingViewer,
  displayPageIndex,
  hasNext,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
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
    if (canonicalQs(parsed.qs || "") !== canonicalQs(window.location.search)) return null;
    if (!matchesListingSnapshot(parsed, window.location.search, listingViewer)) return null;

    return parsed;
  } catch {
    return null;
  }
}, [listingViewer]);

const persistNow = useCallback(() => {
  if (hydratingFromUrlRef.current) return;
  if (persistBlockedRef.current) return;
  if (homePathRef.current && pathname !== homePathRef.current) return;

  // ✅ source-of-truth: qs từ URL thật + canonical để match ổn định
  const qsRaw = window.location.search.replace(/^\?/, "");
  if (!canPersistListing(qsRaw)) return;
  const qsCanonical = canonicalQs(qsRaw);
  listQsRef.current = qsCanonical;

  writeLiteNow();

const payload: PersistState = {
  qs: qsCanonical,
  filterSig,
  viewer: listingViewer,
  total: typeof total === "number" ? total : null,

  search,
  priceApplied,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
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
  canPersistListing,
  filterSig,
  listingViewer,
  hasNext,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
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

// Persist list data on data/filter changes; scroll only saves the small state.
// Existing cache formats and navigation snapshots remain the source of restore.
useEffect(() => {
  persistSoon();
}, [pages, persistSoon]);

// Keep navigation's callback stable for memoized cards while using the latest
// filter/data snapshot when the user actually opens a room.
const captureNavigationSnapshotRef = useRef(() => {});
useLayoutEffect(() => {
  captureNavigationSnapshotRef.current = () => {
    writeBackSnapshotNow();
    persistNow();
  };
}, [writeBackSnapshotNow, persistNow]);

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

    // Flush the exact position before leaving, including a pending throttle.
    saveScrollToHistory(true);

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
  filtersVersionRef.current += 1;
  inFlightRef.current = {};

  const nextPages: any[][] = new Array(keepPage + 1);
  pagesRef.current = nextPages;
  setPages(nextPages);

  pageIndexRef.current = keepPage;
  setPageIndex(keepPage);
  setDisplayPageIndex(keepPage);

  cursorsRef.current = [null];
  setHasNext(false);
  setTotal(null);
  setFetchError("");
  setLoading(false);

  setShowSkeleton(true);
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
    filtersVersionRef.current += 1;
    pendingUrlFiltersRef.current = null;
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
    setTermFilters(snap.termFilters ?? []);
    setFeatureFilters(normalizeRoomFeatures(snap.featureFilters));
    setSortMode(snap.sortMode ?? "updated_desc");
    setTotal(typeof snap.total === "number" ? snap.total : null);
    setStatusFilter(snap.statusFilter ?? null);
    const snapBadgeValue = new URLSearchParams(snap.qs ?? "").get(QS.badge);
    const snapBadge = ROOM_BADGES.some((item) => item.id === snapBadgeValue) ? snapBadgeValue as RoomBadge : null;
    setBadgeFilter(snapBadge);

      armRestoredFilterSig({
      search: snap.search ?? "",
      priceApplied: snap.priceApplied ?? PRICE_DEFAULT,
      selectedDistricts: snap.selectedDistricts ?? [],
      selectedRoomTypes: snap.selectedRoomTypes ?? [],
      moveFilter: snap.moveFilter ?? null,
      petFilters: snap.petFilters ?? [],
      termFilters: snap.termFilters ?? [],
      featureFilters: normalizeRoomFeatures(snap.featureFilters),
      sortMode: snap.sortMode ?? "updated_desc",
      statusFilter: snap.statusFilter ?? null,
      badgeFilter: snapBadge,
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
      pageIndexRef.current = pIdx;
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
useLayoutEffect(() => {
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

// The unfiltered fast path has no storage or browser listing request.
if (!url.qs && !isBackFromDetail && !backHint?.qs && initialPageUsable) {
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

      // clear all HOME_STATE_LITE_V2::*
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
  // - URL rỗng ("/") thì KHÔNG restore full HOME_STATE_V3
  // - tránh mở web lần đầu bị render lại pages stale từ sessionStorage
  // - default Home nên ưu tiên SSR initialRooms
  const allowHeavyRestore = isBackFromDetail;

  const match =
    !isReloadRef.current &&
    !!restored &&
    ttlOk &&
    allowHeavyRestore &&
    matchesListingSnapshot(restored, currentQs, listingViewer) &&
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
  const restoredTerms = rest.termFilters ?? [];
const restoredFeatures = normalizeRoomFeatures(rest.featureFilters);
  const restoredSort = rest.sortMode ?? "updated_desc";

  setSearch(restoredSearch);
  setPriceDraft(restoredPrice);
  setPriceApplied(restoredPrice);
  setSelectedDistricts(restoredDistricts);
  setSelectedRoomTypes(restoredTypes);
  setMoveFilter(restoredMove);
  setPetFilters(restoredPets);
  setTermFilters(restoredTerms);
setFeatureFilters(restoredFeatures);
  setSortMode(restoredSort);
  setTotal(typeof rest.total === "number" ? rest.total : null);

  const restoredStatus = !isReloadRef.current ? rest.statusFilter ?? null : null;
  setStatusFilter(restoredStatus);
  const restoredBadgeValue = new URLSearchParams(rest.qs ?? "").get(QS.badge);
  const restoredBadge = !isReloadRef.current && ROOM_BADGES.some((item) => item.id === restoredBadgeValue) ? restoredBadgeValue as RoomBadge : null;
  setBadgeFilter(restoredBadge);

  armRestoredFilterSig({
    search: restoredSearch,
    priceApplied: restoredPrice,
    selectedDistricts: restoredDistricts,
    selectedRoomTypes: restoredTypes,
    moveFilter: restoredMove,
    petFilters: restoredPets,
    termFilters: restoredTerms,
    featureFilters: restoredFeatures,
    sortMode: restoredSort,
    statusFilter: restoredStatus,
    badgeFilter: restoredBadge,
  });

  // (Giữ behavior cũ khi KHÔNG reload)
      pagesRef.current = rest.pages ?? [];
      setPages(rest.pages ?? []);
      cursorsRef.current = rest.cursors ?? [null];
      setHasNext(Boolean(rest.hasNext));

      pageIndexRef.current = rest.pageIndex ?? 0;
      setPageIndex(pageIndexRef.current);
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
    !isReloadRef.current &&
    effectiveQs &&
    isBackFromDetail
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
    const liteTerms = lite.termFilters ?? [];
const liteFeatures = normalizeRoomFeatures(lite.featureFilters);
    const liteSort = lite.sortMode ?? "updated_desc";
    const liteStatus = !isReloadRef.current ? lite.statusFilter ?? null : null;
    const liteBadgeValue = new URLSearchParams(lite.qs ?? "").get(QS.badge);
    const liteBadge = !isReloadRef.current && ROOM_BADGES.some((item) => item.id === liteBadgeValue) ? liteBadgeValue as RoomBadge : null;

    setSearch(liteSearch);
    setPriceDraft(litePrice);
    setPriceApplied(litePrice);
    setSelectedDistricts(liteDistricts);
    setSelectedRoomTypes(liteTypes);
    setMoveFilter(liteMove);
    setPetFilters(litePets);
    setTermFilters(liteTerms);
setFeatureFilters(liteFeatures);
    setSortMode(liteSort);
    setTotal(typeof lite.total === "number" ? lite.total : null);
    setStatusFilter(liteStatus);
    setBadgeFilter(liteBadge);

    armRestoredFilterSig({
      search: liteSearch,
      priceApplied: litePrice,
      selectedDistricts: liteDistricts,
      selectedRoomTypes: liteTypes,
      moveFilter: liteMove,
      petFilters: litePets,
      termFilters: liteTerms,
    featureFilters: liteFeatures,
      sortMode: liteSort,
      statusFilter: liteStatus,
      badgeFilter: liteBadge,
    });

    const pIdx = lite.pageIndex ?? 0;
    const dIdx = lite.displayPageIndex ?? pIdx;

      const reuseFirstPage = pIdx === 0 && initialPageUsable && makeFilterSigValue(url.filters) === initialFilterSig;
      cursorsRef.current = reuseFirstPage ? [null, initCursor] : [null];
      cursorsRef.current[pIdx] = lite.currentCursor ?? null;

      pageIndexRef.current = pIdx;
      setPageIndex(pIdx);
      setDisplayPageIndex(dIdx);
      setHasNext(reuseFirstPage ? Boolean(initCursor) : Boolean(lite.hasNext));
      if (reuseFirstPage) setTotal(initialTotal ?? null);

      setFetchError("");
      setLoading(false);
      setShowSkeleton(!reuseFirstPage);

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
hydratingFromUrlRef.current = true;

// ✅ snapshot URL filters để fetch dùng ngay (không phụ thuộc timing setState)
pendingUrlFiltersRef.current = {
  search: url.q,
  min: url.priceFilterActive ? url.minVal : undefined,
  max: url.priceFilterActive ? url.maxVal : undefined,
  priceFilterActive: url.priceFilterActive,
  districts: url.d,
  roomTypes: url.t,
  move: url.m,
  pets: url.pet,
  terms: url.term,
  features: url.features,
  sort: url.s,
  status: url.st,
  badge: url.badge,
};

const urlPrice: [number, number] = [url.minVal, url.maxVal];
const urlStatus = url.st;
const urlPets = url.pet ?? [];
const urlTerms = url.term ?? [];
const urlFeatures = normalizeRoomFeatures(url.features);

setSearch(url.q);
setPriceDraft(urlPrice);
setPriceApplied(urlPrice);
setSelectedDistricts(url.d);
setSelectedRoomTypes(url.t);
setMoveFilter(url.m);
setPetFilters(urlPets);
setTermFilters(urlTerms);
setFeatureFilters(urlFeatures);
setSortMode(url.s);
setStatusFilter(urlStatus);
setBadgeFilter(url.badge);

armRestoredFilterSig({
  search: url.q,
  priceApplied: urlPrice,
  selectedDistricts: url.d,
  selectedRoomTypes: url.t,
  moveFilter: url.m,
  petFilters: urlPets,
  termFilters: urlTerms,
    featureFilters: urlFeatures,
  sortMode: url.s,
  statusFilter: urlStatus,
  badgeFilter: url.badge,
});

const pageFromUrl = url.nextPage;

// SSR đã tải đúng trang đầu theo query hiện tại. Dùng thẳng kết quả đó thay vì
// xóa danh sách, hiện skeleton rồi gọi lại cùng một RPC sau hydration.
if (initialPageUsable && pageFromUrl === 0 && makeFilterSigValue(url.filters) === initialFilterSig) {
  pagesRef.current = [initialRooms ?? []];
  setPages([initialRooms ?? []]);

  cursorsRef.current = [null, initCursor];
  setHasNext(Boolean(initCursor));
  setPageIndex(0);
  setDisplayPageIndex(0);
  setTotal(typeof initialTotal === "number" ? initialTotal : null);
  setFetchError(initialError);
  setLoading(false);
  setShowSkeleton(false);
  pendingUrlFiltersRef.current = null;

  finishHydrate();
  return;
}

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
    const savedInUrl = new URLSearchParams(window.location.search).get("view") === "saved";
    if (savedInUrl !== isSavedView) {
      window.location.reload();
      return;
    }
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
  const liteTerms = lite.termFilters ?? [];
const liteFeatures = normalizeRoomFeatures(lite.featureFilters);
  const liteSort = lite.sortMode ?? "updated_desc";
  const liteStatus = !isReloadRef.current ? lite.statusFilter ?? null : null;
  const liteBadgeValue = new URLSearchParams(lite.qs ?? "").get(QS.badge);
  const liteBadge = !isReloadRef.current && ROOM_BADGES.some((item) => item.id === liteBadgeValue) ? liteBadgeValue as RoomBadge : null;
  const litePriceFilterActive = hasExplicitPriceFilter(effectiveQs);

  setSearch(liteSearch);
  setPriceDraft(litePrice);
  setPriceApplied(litePrice);
  setSelectedDistricts(liteDistricts);
  setSelectedRoomTypes(liteTypes);
  setMoveFilter(liteMove);
  setPetFilters(litePets);
  setTermFilters(liteTerms);
setFeatureFilters(liteFeatures);
  setSortMode(liteSort);
  setTotal(typeof lite.total === "number" ? lite.total : null);
  setStatusFilter(liteStatus);
  setBadgeFilter(liteBadge);

  const pIdx = lite.pageIndex ?? 0;
  const dIdx = lite.displayPageIndex ?? pIdx;

  armRestoredFilterSig({
    search: liteSearch,
    priceApplied: litePrice,
    priceFilterActive: litePriceFilterActive,
    selectedDistricts: liteDistricts,
    selectedRoomTypes: liteTypes,
    moveFilter: liteMove,
    petFilters: litePets,
    termFilters: liteTerms,
    featureFilters: liteFeatures,
    sortMode: liteSort,
    statusFilter: liteStatus,
    badgeFilter: liteBadge,
  });
  skipNextFilterEffectRef.current = true;

    resetPagination(pIdx);
    cursorsRef.current[pIdx] = (lite.currentCursor ?? null) as UrlCursor;
    setHasNext(Boolean(lite.hasNext));
    setTotal(lite.total ?? null);
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
  min: litePriceFilterActive ? litePrice[0] : undefined,
  max: litePriceFilterActive ? litePrice[1] : undefined,
  d: liteDistricts,
  t: liteTypes,
  m: liteMove,
  pet: litePets,
  term: liteTerms,
    features: liteFeatures,
  s: liteSort,
  st: liteStatus,
    badge: liteBadge,
  p: pIdx,
  c: (lite.currentCursor ?? null) as UrlCursor,
});
    replaceUrlShallow(qsFromLite);

    pendingUrlFiltersRef.current = {
      search: liteSearch,
      min: litePriceFilterActive ? litePrice[0] : undefined,
      max: litePriceFilterActive ? litePrice[1] : undefined,
      priceFilterActive: litePriceFilterActive,
      districts: liteDistricts,
      roomTypes: liteTypes,
      move: liteMove,
      pets: litePets,
      terms: liteTerms,
    features: liteFeatures,
      sort: liteSort,
      status: liteStatus,
      badge: liteBadge,
    };

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
const urlStatus = url.st;
const urlPets = url.pet ?? [];
const urlTerms = url.term ?? [];
const urlFeatures = normalizeRoomFeatures(url.features);

pendingUrlFiltersRef.current = {
  search: url.q,
  min: url.priceFilterActive ? url.minVal : undefined,
  max: url.priceFilterActive ? url.maxVal : undefined,
  priceFilterActive: url.priceFilterActive,
  districts: url.d,
  roomTypes: url.t,
  move: url.m,
  pets: urlPets,
  terms: urlTerms,
    features: urlFeatures,
  sort: url.s,
  status: urlStatus,
  badge: url.badge,
};

setSearch(url.q);
setPriceDraft(urlPrice);
setPriceApplied(urlPrice);
setSelectedDistricts(url.d);
setSelectedRoomTypes(url.t);
setMoveFilter(url.m);
setPetFilters(urlPets);
setTermFilters(urlTerms);
setFeatureFilters(urlFeatures);
setSortMode(url.s);
setStatusFilter(urlStatus);
setBadgeFilter(url.badge);

armRestoredFilterSig({
  search: url.q,
  priceApplied: urlPrice,
  priceFilterActive: url.priceFilterActive,
  selectedDistricts: url.d,
  selectedRoomTypes: url.t,
  moveFilter: url.m,
  petFilters: urlPets,
  termFilters: urlTerms,
    featureFilters: urlFeatures,
  sortMode: url.s,
  statusFilter: urlStatus,
  badgeFilter: url.badge,
});

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
  isSavedView,
]);

  // ================== FETCH PAGE ==================
  const fetchPage = useCallback(
  async (targetIndex: number) => {
    if (isSavedView) {
      setLoading(false);
      setShowSkeleton(false);
      return;
    }
    if (authResolving || authResolvingRef.current) return;
    const pending = pendingUrlFiltersRef.current;
    if (!pending && filterSig !== lastFilterSigRef.current) return;
    const myVersion = filtersVersionRef.current;

    if (pagesRef.current[targetIndex] !== undefined) {
  if (debugEnabled) {
  console.log("[fetchPage] skip: cached page exists", { targetIndex });
}

  if (debugEnabled) {
    const cachedPage = pagesRef.current[targetIndex];

    pushPageDebug({
      at: new Date().toLocaleTimeString(),
      event: "SKIP_CACHED_PAGE",
      targetIndex,
      pageIndex: pageIndexRef.current,
      displayPageIndex,
      total,
      rawLen: Array.isArray(cachedPage) ? cachedPage.length : undefined,
      dedupedLen: Array.isArray(cachedPage) ? cachedPage.length : undefined,
      limit: LIMIT,
      cursorUsedForThisPage: cursorsRef.current[targetIndex] ?? null,
      nextCursor: cursorsRef.current[targetIndex + 1] ?? null,
      sortMode,
      hasNextBefore: hasNext,
      finalHasNext: Boolean(cursorsRef.current[targetIndex + 1]),
      cachedState: "pagesRef.current[targetIndex] !== undefined",
      filterSig: lastFilterSigRef.current,
      note: "fetchPage bị skip vì page này đã có trong cache. Nếu nút Sau bị tắt ở đây, có thể hasNext/cursor cache đang cũ.",
    });
  }

  setShowSkeleton(false);
  return;
}

    const reqKey = `${myVersion}::${lastFilterSigRef.current ?? ""}::${targetIndex}`;

    if (inFlightRef.current[reqKey]) {
      console.log("[fetchPage] skip: inFlight", { reqKey });
      return;
    }

    inFlightRef.current[reqKey] = true;
    if (debugEnabled) {
  console.log("[fetchPage] start request", { reqKey });
}

    const isVisible = targetIndex === pageIndexRef.current;

    if (isVisible) {
      setLoading(true);
      setShowSkeleton(true);
      setFetchError("");
    }

    try {
      const cursorForThisPage = cursorsRef.current[targetIndex] ?? null;

    // ✅ alias để lát nữa render debug dễ hiểu
    const cursorUsedForThisPage = cursorForThisPage;

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
  currentUserId,
  anonSessionId: initialAnonSessionId,

 vipAccessTokenHash:
  vipAccessTokenHashRef.current ?? null,

  search: (pending?.search ?? appliedSearch).trim()
    ? (pending?.search ?? appliedSearch).trim()
    : undefined,

  minPrice: (pending ? pending.priceFilterActive : priceFilterActive)
    ? (pending?.min ?? minPriceApplied)
    : undefined,
  maxPrice: (pending ? pending.priceFilterActive : priceFilterActive)
    ? (pending?.max ?? maxPriceApplied)
    : undefined,
  sortMode: pending?.sort ?? sortMode,
  status: pending ? pending.status : statusFilter,
  badge: pending ? pending.badge : badgeFilter,

  districts: (pending?.districts ?? selectedDistricts).length
    ? (pending?.districts ?? selectedDistricts)
    : undefined,

  roomTypes: (pending?.roomTypes ?? selectedRoomTypes).length
    ? (pending?.roomTypes ?? selectedRoomTypes)
    : undefined,

  move: pending ? pending.move : moveFilter,

  petPolicies: (pending?.pets ?? petFilters).length
    ? (pending?.pets ?? petFilters)
    : undefined,

  featureFilters: pending?.features ?? featureFilters,
  contractTerms: (pending?.terms ?? termFilters).length
    ? (pending?.terms ?? termFilters)
    : undefined,
});

      if (myVersion !== filtersVersionRef.current) return;
      if (targetIndex === pageIndexRef.current) setTotal(typeof res.total === "number" ? res.total : null);

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

// ✅ DEBUG SORT GIÁ: lấy vài dòng đầu/cuối của page để xem thứ tự có đúng không
const debugRows = deduped.map((r, i) => ({
  i,
  id: r?.id ?? null,
  room_code: r?.room_code ?? null,
  price: typeof r?.price === "number" ? r.price : Number(r?.price ?? NaN),
  updated_at: r?.updated_at ?? null,
  created_at: r?.created_at ?? null,
}));

const debugPrices = debugRows
  .map((r) => r.price)
  .filter((n) => Number.isFinite(n));

const pagePriceMin = debugPrices.length ? Math.min(...debugPrices) : null;
const pagePriceMax = debugPrices.length ? Math.max(...debugPrices) : null;

const firstRows = debugRows.slice(0, 5);
const lastRows = debugRows.slice(-5);

cursorsRef.current[targetIndex + 1] = res.nextCursor ?? null;

const nextHasNext = Boolean(res.nextCursor) && deduped.length === LIMIT;
if (targetIndex === pageIndexRef.current) setHasNext(nextHasNext);

// ✅ DEBUG PAGINATION RESULT
if (debugEnabled) {
  pushPageDebug({
    at: new Date().toLocaleTimeString(),
    event: "FETCH_RESULT",
    targetIndex,
    pageIndex: pageIndexRef.current,
    displayPageIndex,
    total: typeof res.total === "number" ? res.total : null,
    rawLen: Array.isArray(res.data) ? res.data.length : 0,
    dedupedLen: deduped.length,
    limit: LIMIT,
    cursorUsedForThisPage,
    nextCursor: res.nextCursor ?? null,
    sortMode: pending?.sort ?? sortMode,
    hasNextBefore: hasNext,
    finalHasNext: nextHasNext,
    cachedState: pagesRef.current[targetIndex] !== undefined ? "cached_after_fetch" : "not_cached_before_fetch",
    filterSig: lastFilterSigRef.current,
      pagePriceMin,
  pagePriceMax,
  firstRows,
  lastRows,
    note:
      !res.nextCursor && typeof res.total === "number" && res.total > (targetIndex + 1) * LIMIT
        ? "NGHI RPC: total còn nhiều nhưng nextCursor = null."
        : res.nextCursor && deduped.length < LIMIT
          ? "NGHI DEDUP: RPC có nextCursor nhưng dedupedLen < LIMIT nên frontend tự tắt hasNext."
          : nextHasNext
            ? "OK: có nextCursor và đủ LIMIT, nút Sau nên bật."
            : "Có thể đã hết dữ liệu thật hoặc cần xem total/rawLen/nextCursor.",
  });
}

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
       const nextReqKey = `${myVersion}::${lastFilterSigRef.current ?? ""}::${nextIdx}`;
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
      if (myVersion === filtersVersionRef.current && targetIndex === pageIndexRef.current) {
        setFetchError(e?.message ?? "Tải dữ liệu thất bại");
        setLoading(false);
        setShowSkeleton(false);
        setIsRefreshing(false);
      }
    } finally {
      inFlightRef.current[reqKey] = false;

      if (myVersion === filtersVersionRef.current && targetIndex === pageIndexRef.current) {
        setLoading(false);
        setShowSkeleton(false);
        setIsRefreshing(false);
      }
    }
  },
    [
      adminLevel,
      authResolving,
      filterSig,
      currentUserId,
      initialAnonSessionId,
      appliedSearch,
      minPriceApplied,
      maxPriceApplied,
      priceFilterActive,
      sortMode,
      statusFilter,
      badgeFilter,
      isSavedView,
      selectedDistricts,
      selectedRoomTypes,
      moveFilter,
      petFilters,
      termFilters,

      featureFilters,
      debugEnabled,
      displayPageIndex,
      total,
      hasNext,
      pushPageDebug,
   ]
   );
   useEffect(() => {
   fetchPageRef.current = fetchPage;
    }, [fetchPage]);

    // Apply cached scroll after DOM layout, before paint: no visible frame at 0
    // on a remount. Keep it pending while a fallback page is still loading.
useLayoutEffect(() => {
  const st = pendingScrollTopRef.current;
  if (st == null) return;

  const el = scrollRef.current;
  if (!el) return;
  if (loading || showSkeleton) return;
  el.scrollTop = st;
  lastScrollTopRef.current = st;
  pendingScrollTopRef.current = null;
}, [
  displayPageIndex,
  roomsToRender.length,
  loading,
  showSkeleton,
]);


  // ================== CENTRAL FETCH ==================
useEffect(() => {
  if (pageIndex !== pageIndexRef.current) return;
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
    let positionTimer = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        lastScrollTopRef.current = el.scrollTop;

        // ✅ update history scroll (throttle theo raf)
        saveScrollToHistory();

        // No pages serialization or full list writes while scrolling.
        if (!positionTimer) positionTimer = window.setTimeout(() => {
          positionTimer = 0;
          writeLiteNow();
        }, 200);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (positionTimer) clearTimeout(positionTimer);
    };
}, [writeLiteNow, saveScrollToHistory]);

const resetAllFiltersAndReload = useCallback(() => {
  if (filterApplyTimerRef.current) {
    window.clearTimeout(filterApplyTimerRef.current);
    filterApplyTimerRef.current = null;
  }

  // Reset toàn bộ phải luôn tải dữ liệu mặc định mới, không khôi phục cache
  // của danh sách trước khi người dùng bắt đầu tìm kiếm.
  filtersVersionRef.current += 1;

  const defaultFilters = {
    search: "",
    min: PRICE_DEFAULT[0],
    max: PRICE_DEFAULT[1],
    priceFilterActive: false,
    districts: [] as string[],
    roomTypes: [] as string[],
    move: null,
    pets: [] as ("cat" | "dog" | "nopet")[],
    terms: [] as ("short" | "long")[],
    features: [] as RoomFeature[],
    sort: "updated_desc" as SortMode,
    status: null,
    badge: null as RoomBadge | null,
  };

  pendingUrlFiltersRef.current = defaultFilters;
  armRestoredFilterSig({
    search: defaultFilters.search,
    priceApplied: [defaultFilters.min, defaultFilters.max],
    priceFilterActive: false,
    selectedDistricts: defaultFilters.districts,
    selectedRoomTypes: defaultFilters.roomTypes,
    moveFilter: defaultFilters.move,
    petFilters: defaultFilters.pets,
    termFilters: defaultFilters.terms,
    featureFilters: defaultFilters.features,
    sortMode: defaultFilters.sort,
    statusFilter: defaultFilters.status,
    badgeFilter: defaultFilters.badge,
  });

  setSearch(defaultFilters.search);
  setPriceDraft([defaultFilters.min, defaultFilters.max]);
  setPriceApplied([defaultFilters.min, defaultFilters.max]);
  setPriceFilterActive(false);
  setSelectedDistricts(defaultFilters.districts);
  setSelectedRoomTypes(defaultFilters.roomTypes);
  setMoveFilter(defaultFilters.move);
  setPetFilters(defaultFilters.pets);
  setTermFilters(defaultFilters.terms);
  setFeatureFilters(defaultFilters.features);
  setSortMode(defaultFilters.sort);
  setStatusFilter(defaultFilters.status);
  setBadgeFilter(defaultFilters.badge);
  setTotal(null);

  pageIndexRef.current = 0;
  lastPageIndexRef.current = 0;
  lastDisplayPageIndexRef.current = 0;
  resetPagination(0);

  replaceUrlShallow(buildQs({
    q: defaultFilters.search,
    min: undefined,
    max: undefined,
    d: defaultFilters.districts,
    t: defaultFilters.roomTypes,
    m: defaultFilters.move,
    pet: defaultFilters.pets,
    term: defaultFilters.terms,
    features: defaultFilters.features,
    s: defaultFilters.sort,
    st: defaultFilters.status,
    badge: defaultFilters.badge,
    p: 0,
    c: null,
  }));

  try {
    sessionStorage.removeItem(HOME_BACK_SNAPSHOT_KEY);
    sessionStorage.removeItem(HOME_STATE_KEY);
  } catch {}

  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    lastScrollTopRef.current = 0;
  });

  queueMicrotask(() => fetchPageRef.current(0));
}, [armRestoredFilterSig, buildQs, replaceUrlShallow, resetPagination]);

// User input supersedes a pending URL/cache restoration immediately, even
// while the debounced search value is still catching up.
const setSearchFromInput = useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
  if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);
  pendingRestoredFilterSigRef.current = null;
  pendingUrlFiltersRef.current = null;
  skipNextFilterEffectRef.current = false;
  hydratingFromUrlRef.current = false;
  filtersVersionRef.current += 1;
  setSearch(value);
}, []);

// ================== FILTER CHANGE ==================
useEffect(() => {

  const applied = appliedSearch.trim();
  const customerFilters = customerFilterDetails({
    minPrice: priceFilterActive ? minPriceApplied : undefined,
    maxPrice: priceFilterActive ? maxPriceApplied : undefined,
    districts: selectedDistricts,
    roomTypes: selectedRoomTypes,
    amenities: featureFilters,
  });

  // ✅ nếu vừa restore/back/hydrate thì chờ đến đúng signature đã restore
  if (pendingRestoredFilterSigRef.current) {
    if (filterSig !== pendingRestoredFilterSigRef.current) return;
    lastFilterSigRef.current = filterSig;
    prevAppliedSearchRef.current = applied;
    previousCustomerFilters.current = customerFilters;
    pendingRestoredFilterSigRef.current = null;
    pendingUrlFiltersRef.current = null;
    skipNextFilterEffectRef.current = false;
    return;
  }

  // ✅ nếu vừa restore/back/hydrate thì chỉ đồng bộ signature, KHÔNG reset
  if (skipNextFilterEffectRef.current || hydratingFromUrlRef.current) {
    skipNextFilterEffectRef.current = false;
    lastFilterSigRef.current = filterSig;
    prevAppliedSearchRef.current = applied;
    previousCustomerFilters.current = customerFilters;
    return;
  }

  // ✅ không đổi filter thật sự -> không làm gì
  const beforeCustomerFilters = previousCustomerFilters.current ?? customerFilters;
  previousCustomerFilters.current = customerFilters;
  if (filterSig === lastFilterSigRef.current) return;
  if (applied !== prevAppliedSearchRef.current) {
    const details = customerSearchDetails(applied);
    if (details) trackVisitorEvent("keyword_search", undefined, details);
  }
  trackVisitorEvent("filter_use", undefined, changedCustomerFilters(beforeCustomerFilters, customerFilters));

  // Clearing or changing search uses the current filters, never a pre-search list.
  prevAppliedSearchRef.current = applied;
  pendingUrlFiltersRef.current = null;

  if (isSavedView) {
    if (filterApplyTimerRef.current) window.clearTimeout(filterApplyTimerRef.current);
    lastFilterSigRef.current = filterSig;
    setPageIndex(0);
    setDisplayPageIndex(0);
    pageIndexRef.current = 0;
    replaceUrlShallow(buildQs({
      q: applied,
      min: priceFilterActive ? minPriceApplied : undefined,
      max: priceFilterActive ? maxPriceApplied : undefined,
      d: selectedDistricts,
      t: selectedRoomTypes,
      m: moveFilter,
      pet: petFilters,
      term: termFilters,
    features: featureFilters,
      s: sortMode,
      st: statusFilter,
      badge: badgeFilter,
      p: 0,
      c: null,
    }));
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
    return;
  }

  // ====== Normal filter change flow (debounced) ======
  filtersVersionRef.current += 1;

 const qs = buildQs({
  q: applied,
  min: priceFilterActive ? priceApplied[0] : undefined,
  max: priceFilterActive ? priceApplied[1] : undefined,
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
  pet: petFilters,
  term: termFilters,
    features: featureFilters,
  s: sortMode,
  st: statusFilter,
  badge: badgeFilter,
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
  }, 25);

  return () => {
    if (filterApplyTimerRef.current) {
      window.clearTimeout(filterApplyTimerRef.current);
    }
  };
}, [
  filterSig,
  appliedSearch,
  priceApplied,
  priceFilterActive,
  minPriceApplied,
  maxPriceApplied,
  selectedDistricts,
  selectedRoomTypes,
  featureFilters,
  moveFilter,
  sortMode,
  statusFilter,
  badgeFilter,
  isSavedView,
  replaceUrlShallow,
  buildQs,
  resetPagination,
  persistSoon,
  fetchPage,
  displayPageIndex,
  hasNext,
  armRestoredFilterSig,
]);

// ================== NEXT / PREV ==================
const goNext = useCallback(() => {
  if (filterSig !== lastFilterSigRef.current || search !== appliedSearch) return;
  if (loading || !hasNext) {
  if (debugEnabled) {
    pushPageDebug({
      at: new Date().toLocaleTimeString(),
      event: "NEXT_BLOCKED",
      pageIndex,
      displayPageIndex,
      total,
      limit: LIMIT,
      cursorUsedForThisPage: cursorsRef.current[pageIndex] ?? null,
      nextCursor: cursorsRef.current[pageIndex + 1] ?? null,
      sortMode,
      hasNextBefore: hasNext,
      finalHasNext: hasNext,
      filterSig: lastFilterSigRef.current,
      note: loading
        ? "Bấm Sau bị chặn vì loading = true."
        : "Bấm Sau bị chặn vì hasNext = false.",
    });
  }

  return;
}

const next = pageIndex + 1;

// ✅ cursor để fetch trang "next" đã được lưu ở cursorsRef[next]
const nextCursor = (cursorsRef.current[next] ?? null) as UrlCursor;

if (!nextCursor) {
  if (debugEnabled) {
    pushPageDebug({
      at: new Date().toLocaleTimeString(),
      event: "NEXT_BLOCKED_NO_CURSOR",
      pageIndex,
      displayPageIndex,
      total,
      limit: LIMIT,
      cursorUsedForThisPage: cursorsRef.current[pageIndex] ?? null,
      nextCursor: null,
      sortMode,
      hasNextBefore: hasNext,
      finalHasNext: false,
      filterSig: lastFilterSigRef.current,
      note: "hasNext có thể true nhưng cursor trang sau không tồn tại.",
    });
  }

  return;
}

  setPageIndex(next);

// ✅ lưu scroll của entry hiện tại trước khi đổi URL
saveScrollToHistory();

const qs = buildQs({
  q: appliedSearch.trim(),
  min: priceFilterActive ? priceApplied[0] : undefined,
  max: priceFilterActive ? priceApplied[1] : undefined,
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
pet: petFilters,
term: termFilters,
    features: featureFilters,
  s: sortMode,
  st: statusFilter,
  badge: badgeFilter,
  p: next,          // optional: hiển thị page
  c: nextCursor,    // ✅ nguồn sự thật để fetch
});
replaceUrlShallow(qs);

persistSoon();

}, [
  loading,
  hasNext,
  filterSig,
  search,
  pageIndex,
  buildQs,
  replaceUrlShallow,
  appliedSearch,
  priceApplied,
  priceFilterActive,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  petFilters,
  termFilters,

  featureFilters,
  sortMode,
  persistSoon,
  statusFilter,
  badgeFilter,
  saveScrollToHistory,
  debugEnabled,
  displayPageIndex,
  total,
  pushPageDebug,
]);

const goPrev = useCallback(() => {
  if (loading || filterSig !== lastFilterSigRef.current || search !== appliedSearch) return;

  const previous = Math.max(0, pageIndex - 1);
  const next = cursorsRef.current[previous] ? previous : 0;

  // ✅ page 0 -> cursor null, còn page khác -> cursor đã lưu ở cursorsRef[next]
  const prevCursor = (cursorsRef.current[next] ?? null) as UrlCursor;

  setPageIndex(next);

// ✅ lưu scroll của entry hiện tại trước khi đổi URL
saveScrollToHistory();

const qs = buildQs({
  q: appliedSearch.trim(),
  min: priceFilterActive ? priceApplied[0] : undefined,
  max: priceFilterActive ? priceApplied[1] : undefined,
  d: selectedDistricts,
  t: selectedRoomTypes,
  m: moveFilter,
pet: petFilters,
term: termFilters,
    features: featureFilters,
  s: sortMode,
  st: statusFilter,
  badge: badgeFilter,
  p: next,
  c: prevCursor,
});
replaceUrlShallow(qs);

persistSoon();

}, [
  loading,
  filterSig,
  search,
  pageIndex,
  buildQs,
  replaceUrlShallow,
    appliedSearch,
  priceApplied,
  priceFilterActive,
  selectedDistricts,
  selectedRoomTypes,
  moveFilter,
  sortMode,
  persistSoon,
  statusFilter,
  badgeFilter,
  saveScrollToHistory,
]);

// A server-verified session already owns the SSR page. Re-fetch only if the
// browser session changes, after resolving the new role and discarding its old cursor.
const lastSessionUserIdRef = useRef(initialUserId);
useEffect(() => {
  let active = true;
  let sawAuthEvent = false;
  const applySession = (uid: string | null) => {
    if (!active || uid === lastSessionUserIdRef.current) return;
    lastSessionUserIdRef.current = uid;
    authResolvingRef.current = Boolean(uid);
    setAuthResolving(Boolean(uid));
    setCurrentUserId(uid);
    setIsLoggedIn(Boolean(uid));
    setAdminLevel(0);
    setCanFilterHidden(false);
    const params = new URLSearchParams(window.location.search);
    params.delete(QS.p);
    params.delete(QS.c);
    if (params.get(QS.s) === "hidden") {
      params.delete(QS.s);
      setSortMode("updated_desc");
    }
    replaceUrlShallow(params.toString());
    resetPagination(0);
  };

  void supabase.auth.getSession().then(({ data }) => {
    if (!sawAuthEvent) applySession(data.session?.user?.id ?? null);
  });
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    sawAuthEvent = true;
    applySession(session?.user?.id ?? null);
  });

  return () => {
    active = false;
    sub.subscription.unsubscribe();
  };
}, [replaceUrlShallow, resetPagination]);

useEffect(() => {
  if (!authResolving || !currentUserId) return;
  let active = true;
  const finish = (level: number, email?: string) => {
    if (!active || lastSessionUserIdRef.current !== currentUserId) return;
    authResolvingRef.current = false;
    setAdminLevel(level === 1 || level === 2 ? level : 0);
    setCanFilterHidden((level === 1 || level === 2) && email?.toLowerCase() === HIDDEN_ROOMS_ADMIN_EMAIL);
    setAuthResolving(false);
  };
  void Promise.all([supabase.rpc("get_my_admin_level"), supabase.auth.getUser()]).then(([role, viewer]) => {
    finish(role.error ? 0 : Number(role.data ?? 0), viewer.data.user?.email);
  }, () => finish(0));
  return () => { active = false; };
}, [authResolving, currentUserId]);

 // ================== Khóa Anon ==================
useEffect(() => {
  if (vipValidationPending) {
    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    return;
  }

  if (isLoggedIn || hasVipAccess) {
    setIsAnonLocked(false);

    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }

    return;
  }

  const expiresAtMs = Date.parse(initialAnonExpiresAt ?? "");
  const lock = () => {
    setIsAnonLocked(true);
    setGeneralInquiryOpen(true);
    pagesRef.current = [];
    setPages([]);
    setSavedRooms([]);
    cursorsRef.current = [null];
    setHasNext(false);
    setTotal(0);
  };

  if (!initialAnonSessionId || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    lock();
    return;
  }

  lockTimerRef.current = window.setTimeout(lock, expiresAtMs - Date.now());

  return () => {
    if (lockTimerRef.current) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  };
}, [isLoggedIn, hasVipAccess, vipValidationPending, initialAnonExpiresAt, initialAnonSessionId]);

const handleNavigateToRoom = useCallback((href: string) => {
  const encodedRoomId = href.match(/\/rooms\/([^/?#]+)/)?.[1] ?? "";
  setOpeningRoomId(decodeURIComponent(encodedRoomId));

  try {
    const el = scrollRef.current;

    if (el) lastScrollTopRef.current = el.scrollTop;
    lastPageIndexRef.current = pageIndex;
    lastDisplayPageIndexRef.current = displayPageIndex;

    saveScrollToHistory(true);
    // Keyboard and programmatic Link activation also need an exact snapshot.
    captureNavigationSnapshotRef.current();
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

}, [
  saveScrollToHistory,
  pageIndex,
  displayPageIndex,
]);

useEffect(() => {
  setOpeningRoomId(null);
}, [pathname]);

// Contact truyền xuống RoomCard:
// - Admin đăng nhập: giữ nguyên thông tin admin hiện tại.
// - Anon VIP: dùng thông tin admin đã tạo Link Giỏ hàng.
// - Anon thường: null nên RoomCard không hiển thị nút Admin.
const roomContactPhone = currentUserId
  ? currentAdminPhone
  : hasVipAccess
    ? vipAdminPhone
    : null;

const roomContactName = currentUserId
  ? currentAdminName
  : hasVipAccess
    ? vipAdminName
    : null;

const toggleSavedView = () => {
  const next = !isSavedView;
  const params = new URLSearchParams(window.location.search);
  if (next) params.set("view", "saved");
  else params.delete("view");
  params.set(QS.p, "0");
  params.delete(QS.c);
  const url = params.toString() ? `${pathname}?${params.toString()}` : pathname;
  window.history.pushState(window.history.state, "", url);
  setIsSavedView(next);
  setFetchError("");
  pageIndexRef.current = 0;
  resetPagination(0);
  setTotal(next ? savedFilteredRooms.length : null);
};

const goToSavedPage = (nextPage: number) => {
  const target = Math.max(0, Math.min(savedPageCount - 1, nextPage));
  setPageIndex(target);
  setDisplayPageIndex(target);
  pageIndexRef.current = target;
  const params = new URLSearchParams(window.location.search);
  params.set(QS.p, String(target));
  params.delete(QS.c);
  replaceUrlShallow(params.toString());
};

const handleGoNext = isSavedView ? () => goToSavedPage(savedPageIndex + 1) : goNext;
const handleGoPrev = isSavedView ? () => goToSavedPage(savedPageIndex - 1) : goPrev;

// ================== RENDER ==================
return (
  <div className="home-redesign relative flex h-screen flex-col overflow-hidden bg-[#241206] text-[#F3E7D6]">
    {/* BACKGROUND FIXED TOÀN MÀN HÌNH */}
    <div className="home-background fixed inset-0 z-0 pointer-events-none">
      <img
        src="/bg-glass.jpg"
        alt=""
        className="h-full w-full object-cover scale-105 blur-[2px]"
      />

      <div className="absolute inset-0 bg-[#241206]/75" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(36,18,6,0.52)_0%,rgba(36,18,6,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_0%,rgba(201,164,106,0.16)_0%,transparent_45%)]" />
    </div>

    <div
      ref={scrollRef}
      className="relative z-10 flex-1 overflow-y-auto pb-32 bg-transparent"
    >
           <header
        data-home-header="true"
        className="home-header
          relative z-50
          border-b border-[#E5C9A9]/20
          bg-[rgba(45,27,20,0.48)]
          backdrop-blur-[28px]
          shadow-[0_10px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]
        "
      >
        <div className="home-header-inner grid w-full max-w-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 md:px-8 md:py-3 2xl:px-12">
          {/* LEFT: LOGO + TITLE */}
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <LogoIntroButton logoSrc="/the-room-logo.webp" />

            <ThemeToggle />
            <div className="home-brand-copy min-w-0 leading-tight text-[#E5C9A9] drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
              <div className="truncate text-base font-semibold md:text-xl">
                The Room SG
              </div>
              <div className="hidden text-xs text-[#C9AA8B] sm:block md:text-sm">
                Cho thuê chung cư, căn hộ &amp; phòng trọ tại TP.HCM
              </div>
            </div>
          </div>

    {/* RIGHT: ACCOUNT */}
        <div className="home-header-actions relative z-[3000] flex shrink-0 items-center gap-2 whitespace-nowrap">
          <button
            type="button"
            onClick={toggleSavedView}
            aria-pressed={isSavedView}
            aria-label={`Phòng đã lưu · ${savedRoomIds.length}`}
            title="Phòng đã lưu"
            className={`home-saved-link flex h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-full border px-0 text-base font-semibold backdrop-blur-[20px] shadow-[0_10px_26px_rgba(0,0,0,0.35)] transition md:min-w-[150px] md:rounded-2xl md:px-3 md:text-xs ${isSavedView ? "border-[#E5C9A9]/70 bg-[rgba(201,164,106,0.25)] text-[#FFE8C6]" : "border-[#E5C9A9]/25 bg-[rgba(45,27,20,0.55)] text-[#E5C9A9] hover:bg-[rgba(255,255,255,0.08)]"}`}
          >
            <span className="home-saved-star">★</span>
            <span className="home-saved-count text-[10px] md:hidden">{savedRoomIds.length}</span>
            <span className="home-saved-label"> Phòng đã lưu · {savedRoomIds.length}</span>
          </button>
          {/* ACCOUNT */}
          <div
            id="auth-anchor"
            className="
              flex h-[36px] min-w-[118px] items-center justify-center
              rounded-2xl border border-[#E5C9A9]/25
              bg-[rgba(45,27,20,0.55)]
              px-0
              text-[12px] font-semibold text-[#E5C9A9]
              backdrop-blur-[20px]
              shadow-[0_10px_26px_rgba(0,0,0,0.35)]
            "
          />
          <HeaderNotifications signedIn={!!currentUserId} adminLevel={adminLevel} />
        </div>

        </div>
      </header>

      <div
        className={`relative transition duration-300 ${isAnonLocked ? "pointer-events-none select-none opacity-25 blur-[7px]" : ""}`}
        aria-disabled={isAnonLocked || undefined}
        inert={isAnonLocked || undefined}
      >
      <section className="home-discovery mx-auto w-full max-w-[1440px] px-4 pb-1 pt-3 sm:px-6 md:pt-4">
          <nav aria-label="Lối tắt tìm kiếm" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ROOM_BADGES.map((badge) => {
              const active = badgeFilter === badge.id;
              return (
                <button
                  key={badge.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBadgeFilter((current) => current === badge.id ? null : badge.id)}
                  className={`home-shortcut shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${badge.className} ${active ? "ring-2 ring-white/35 shadow-[0_0_18px_rgba(255,255,255,.16)]" : "hover:brightness-110"}`}
                >
                  {badge.label}
                </button>
              );
            })}
          </nav>
      </section>

     {/* FILTER BAR */}
      <div className="home-filter-shell relative z-[5000] mx-auto w-full max-w-[1440px] px-4 py-3 sm:px-6">
            <FilterBar
              districts={districts}
              roomTypes={roomTypes}
              loading={loading}
              search={search}
              setSearch={setSearchFromInput}
              priceDraft={priceDraft}
              priceApplied={priceApplied}
              priceFilterActive={priceFilterActive}
              badgeFilterActive={badgeFilter !== null}
              setPriceDraft={setPriceDraft}
              setPriceApplied={setPriceAppliedFromUser}
              selectedDistricts={selectedDistricts}
              setSelectedDistricts={setSelectedDistricts}
              selectedRoomTypes={selectedRoomTypes}
              setSelectedRoomTypes={setSelectedRoomTypes}
              moveFilter={moveFilter}
              setMoveFilter={setMoveFilter}
              petFilters={petFilters}
              setPetFilters={setPetFilters}
              featureFilters={featureFilters}
              setFeatureFilters={setFeatureFilters}
              termFilters={termFilters}
              setTermFilters={setTermFilters}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              sortMode={sortMode}
              canFilterHidden={canFilterHidden && !isSavedView}
              setSortMode={setSortMode}
              total={total}
            />
      </div>
          {debugEnabled && pageDebug && (
        <div
          className="
            fixed left-2 right-2 bottom-[88px] z-[99999]
            max-h-[58vh] overflow-auto rounded-2xl
            border border-yellow-300/40
            bg-black/85 p-3 text-[11px] leading-relaxed text-yellow-100
            shadow-[0_10px_40px_rgba(0,0,0,0.65)]
            backdrop-blur-xl
          "
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-bold text-yellow-300">
              PAGE DEBUG — {pageDebug.event}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const payload = {
                    latest: pageDebug,
                    history: pageDebugHistory,
                  };

                  navigator.clipboard
                    ?.writeText(JSON.stringify(payload, null, 2))
                    .catch(() => {});
                }}
                className="rounded-full border border-white/30 px-3 py-1 text-[10px] text-white"
              >
                Copy
              </button>

              <button
                type="button"
                onClick={() => setPageDebugHistory([])}
                className="rounded-full border border-white/30 px-3 py-1 text-[10px] text-white"
              >
                Xóa history
              </button>

              <button
                type="button"
                onClick={() => setPageDebug(null)}
                className="rounded-full border border-white/30 px-3 py-1 text-[10px] text-white"
              >
                Đóng
              </button>
            </div>
          </div>

          <div className="mb-2 rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-2">
            <div className="mb-1 font-bold text-yellow-300">
              LATEST
            </div>

            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(
                {
                  at: pageDebug.at,
                  event: pageDebug.event,
                  targetIndex: pageDebug.targetIndex,
                  pageIndex: pageDebug.pageIndex,
                  displayPageIndex: pageDebug.displayPageIndex,
                  total: pageDebug.total,
                  rawLen: pageDebug.rawLen,
                  dedupedLen: pageDebug.dedupedLen,
                  limit: pageDebug.limit,
                  sortMode: pageDebug.sortMode,
                  hasNextBefore: pageDebug.hasNextBefore,
                  finalHasNext: pageDebug.finalHasNext,
                  cursorUsedForThisPage: pageDebug.cursorUsedForThisPage,
                  nextCursor: pageDebug.nextCursor,
                  cachedState: pageDebug.cachedState,
                  filterSig: pageDebug.filterSig,
                  pagePriceMin: pageDebug.pagePriceMin,
                  pagePriceMax: pageDebug.pagePriceMax,
                  firstRows: pageDebug.firstRows,
                  lastRows: pageDebug.lastRows,
                  note: pageDebug.note,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/5 p-2">
            <div className="mb-1 font-bold text-white">
              HISTORY — 5 lần gần nhất
            </div>

            <pre className="whitespace-pre-wrap break-words">
          {JSON.stringify(
            pageDebugHistory.map((x, i) => ({
              no: i + 1,
              at: x.at,
              event: x.event,
              targetIndex: x.targetIndex,
              pageIndex: x.pageIndex,
              total: x.total,
              rawLen: x.rawLen,
              dedupedLen: x.dedupedLen,
              limit: x.limit,
              sortMode: x.sortMode,
              finalHasNext: x.finalHasNext,
              pagePriceMin: x.pagePriceMin,
              pagePriceMax: x.pagePriceMax,
              firstRows: x.firstRows,
              lastRows: x.lastRows,
              cursorUsedForThisPage: x.cursorUsedForThisPage,
              nextCursor: x.nextCursor,
              cachedState: x.cachedState,
              note: x.note,
            })),
            null,
            2
          )}
            </pre>
          </div>
        </div>
      )}

        <RoomList
          fetchError={isSavedView ? savedRoomsError : fetchError}
          showSkeleton={isSavedView ? savedRoomsLoading : showSkeleton}
          roomsToRender={visibleRooms}
          adminLevel={adminLevel}
          currentUserId={currentUserId}
          currentAdminPhone={roomContactPhone}
          currentAdminName={roomContactName}
          pageIndex={pageIndex}
          loading={loading}
          hasNext={visibleHasNext}
          goPrev={handleGoPrev}
          goNext={handleGoNext}
          onNavigate={handleNavigateToRoom}
          openingRoomId={openingRoomId}
          isRefreshing={isRefreshing}
          title={isSavedView ? "Phòng đã lưu" : "Phòng phù hợp"}
          total={typeof total === "number" ? total : undefined}
          stableCardWidth={isSavedView}
          hasRecommendations={showRecommendations}
          onResetAll={resetAllFiltersAndReload}
          emptyMessage={isSavedView && savedRoomIds.length === 0
            ? "Bạn chưa lưu phòng nào."
            : isSavedView
              ? "Không có phòng phù hợp với bộ lọc."
              : "Không có phòng phù hợp."}
          emptyAction={isSavedView && savedRoomIds.length === 0 ? (
            <button type="button" onClick={toggleSavedView} className="rounded-xl border border-[#E5C9A9]/30 bg-white/10 px-4 py-2 text-sm font-semibold text-[#FFE8C6] hover:bg-white/15">
              Xem tất cả phòng
            </button>
          ) : null}
        />
        {showRecommendations && (
          <RoomRecommendations
            filters={recommendationFilters}
            excludeIds={visibleRooms.map(room => String(room.id))}
            adminLevel={adminLevel} currentUserId={currentUserId}
            currentAdminPhone={roomContactPhone} currentAdminName={roomContactName}
            onNavigate={handleNavigateToRoom} openingRoomId={openingRoomId}
          />
        )}
      </div>

    </div>

    <div
      className="home-pagination
        fixed inset-x-0 bottom-0 z-[950]
        border-t border-white/25
        bg-[linear-gradient(rgba(255,255,255,0.08),rgba(255,255,255,0.03))]
        backdrop-blur-[40px]
        shadow-[0_-8px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]
      "
    >
      <Pagination
        goNext={handleGoNext}
        goPrev={handleGoPrev}
        hasNext={visibleHasNext}
        loading={loading || isAnonLocked}
        onConsult={() => setGeneralInquiryOpen(true)}
      />
    </div>

    {generalInquiryOpen && <RoomInquiryModal open mode="general" onClose={() => setGeneralInquiryOpen(false)} />}
    {openingRoomId ? <RoomModalLoadingSkeleton /> : null}

    <div
      id="portal-root"
      className="fixed inset-0 pointer-events-none z-[9999]"
    />
  </div>
);
};

export default HomeClient;
