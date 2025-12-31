"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RoomCard from "../components/RoomCard";
import RoomCardSkeleton from "../components/RoomCardSkeleton";
import { fetchRooms } from "../lib/fetchRooms";
import { supabase } from "@/lib/supabase";
import * as Slider from "@radix-ui/react-slider";
import { createPortal } from "react-dom";

type AuthMode = "email" | "phone";

/* ================== PERF HELPERS ================== */
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

type InitialProps = {
  initialRooms: any[];
  initialNextCursor: string | null;
  initialAdminLevel: 0 | 1 | 2;
  initialDistricts: string[];
  initialRoomTypes: string[];
};

export default function HomeClient(props: InitialProps) {
  const {
    initialRooms,
    initialNextCursor,
    initialAdminLevel,
    initialDistricts,
    initialRoomTypes,
  } = props;

  const router = useRouter();
  /* ================== STATE ================== */
  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");
const [roleReady, setRoleReady] = useState(false);

  // ================== PAGINATION (cursor + cache pages) ==================
  const LIMIT = 20;

  // pages[i] = list rooms của trang i (cache)
  const hasSSRInitialRef = useRef(Boolean(initialRooms?.length));

  const [pages, setPages] = useState<any[][]>(() =>
    initialRooms?.length ? [initialRooms] : []
  );
  const pagesRef = useRef<any[][]>(initialRooms?.length ? [initialRooms] : []);
  const [pageIndex, setPageIndex] = useState(0);

  // cursorsRef[i] = cursor dùng để fetch trang i (trang 0 luôn null)
  const cursorsRef = useRef<any[]>(
    initialRooms?.length ? [null, initialNextCursor] : [null]
  );

  const [hasNext, setHasNext] = useState(
    initialRooms?.length ? Boolean(initialNextCursor) : true
  );

  // chống race khi bấm nhanh / filter đổi
  const requestIdRef = useRef(0);
  const skipFirstFilterEffectRef = useRef(true);
  // ✅ PATCH: lưu adminLevel để truyền xuống RoomCard
  const [adminLevel, setAdminLevel] = useState(0);

  /// Admin L1 đúng nghĩa
  const isAdminL1 = adminLevel === 1;
  const [search, setSearch] = useState("");
  const [priceDraft, setPriceDraft] = useState<[number, number]>([
    3_000_000,
    30_000_000,
  ]);

  // Chỉ dùng để fetch (chỉ đổi khi thả tay)
  const [priceApplied, setPriceApplied] = useState<[number, number]>([
    3_000_000,
    30_000_000,
  ]);

  // ✅ PERF: debounce để tránh spam request khi gõ
  const debouncedSearch = useDebouncedValue(search, 400);const effectiveSearch = useMemo(() => {
    const s = debouncedSearch.trim();
    return s.length >= 2 ? s : "";
  }, [debouncedSearch]);

  const [districts, setDistricts] = useState<string[]>(initialDistricts);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [roomTypes, setRoomTypes] = useState<string[]>(initialRoomTypes);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);

  const [moveFilter, setMoveFilter] = useState<"elevator" | "stairs" | null>(null);

  type SortMode = "updated_desc" | "price_asc" | "price_desc";
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const sortDetailsRef = useRef<HTMLDetailsElement | null>(null); 
  const canClear = sortMode !== "updated_desc";
  // Filter dropdown controller (stable close on mobile/desktop)
  const [openFilter, setOpenFilter] = useState<null | "district" | "roomType" | "move">(null);

  const districtDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const roomTypeDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const moveDetailsRef = useRef<HTMLDetailsElement | null>(null);

  const closeAllFilters = () => {
    setOpenFilter(null);
    districtDetailsRef.current?.removeAttribute("open");
    roomTypeDetailsRef.current?.removeAttribute("open");
    moveDetailsRef.current?.removeAttribute("open");
  };

  /* ================== USER MENU ================== */
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

// ✅ Portal user menu position (anchor = account button)
const accountBtnRef = useRef<HTMLButtonElement | null>(null);
const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);

const updateMenuPos = () => {
  const el = accountBtnRef.current;
  if (!el) return;
  const r = el.getBoundingClientRect();
  setMenuPos({
    left: r.left,
    top: r.bottom + 8, // mở xuống dưới nút (8px)
    width: r.width,
  });
};

useLayoutEffect(() => {
  if (!userMenuOpen) return;
  updateMenuPos();
}, [userMenuOpen]);

useEffect(() => {
  if (!userMenuOpen) return;

  const onResize = () => updateMenuPos();
  const onScroll = () => updateMenuPos();

  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, true); // bắt cả scroll trong container
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll, true);
  };
}, [userMenuOpen]);

  // Modal chọn trang sau khi login (chỉ mở khi admin)
  const [postLoginOpen, setPostLoginOpen] = useState(false);

  /* ================== AUTH UI ================== */
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("email");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); // ví dụ: +84901234567
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState<string>("");

  const canLogin = useMemo(() => {
    const okIdentity =
      authMode === "email"
        ? email.trim().length > 3 && email.includes("@")
        : phone.trim().length >= 9; // phone dạng +84...
    return okIdentity && password.trim().length >= 6;
  }, [authMode, email, phone, password]);

  // ✅ PATCH: Helper lấy level từ admin_users (đặt gần handleLogin)
  const fetchAdminLevel = async (uid?: string | null) => {
    if (!uid) return 0;
    const { data } = await supabase
      .from("admin_users")
      .select("level")
      .eq("user_id", uid)
      .maybeSingle();

    return data?.level ?? 0;
  };

  /* ================== AUTH STATE ================== */
  useEffect(() => {
  const init = async () => {
    const { data } = await supabase.auth.getUser();
    const u = data?.user ?? null;
    setUser(u);

    // ✅ PATCH: sync admin level on refresh
    if (u?.id) {
      const level = await fetchAdminLevel(u.id);
      setAdminLevel(level);
      setIsAdmin(level >= 1);
    } else {
      // public
      setAdminLevel(0);
      setIsAdmin(false);
    }

    // ✅ FIX race condition: role đã sẵn sàng
    setRoleReady(true);
  };

  init();

  const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
    const u = session?.user ?? null;
    setUser(u);

    // ✅ PATCH: sync admin level when auth changes
    if (u?.id) {
      const level = await fetchAdminLevel(u.id);
      setAdminLevel(level);
      setIsAdmin(level >= 1);
    } else {
      setAdminLevel(0);
      setIsAdmin(false);
      setUserMenuOpen(false);
    }

    // ✅ FIX race condition: sau auth change cũng “ready”
    setRoleReady(true);
  });

  return () => {
    sub?.subscription?.unsubscribe?.();
  };
}, []);


  useEffect(() => {
    if (!userMenuOpen) return;

    const onPointerDownCapture = (e: PointerEvent) => {
      const menuEl = userMenuRef.current;
      const btnEl = accountBtnRef.current;
      const target = e.target as Node | null;

      if (!target) return setUserMenuOpen(false);

      // click inside menu OR inside anchor button => keep open
      if (menuEl && menuEl.contains(target)) return;
      if (btnEl && btnEl.contains(target)) return;

      setUserMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  const openAuth = () => {
    setAuthMsg("");
    setPassword("");
    setAuthOpen(true);
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthMsg("");
    setPassword("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleLogin = async () => {
    if (!canLogin) return;

    setAuthLoading(true);
    setAuthMsg("");

    try {
      const credentials =
        authMode === "email"
          ? { email: email.trim(), password: password.trim() }
          : { phone: phone.trim(), password: password.trim() };

      const { error } = await supabase.auth.signInWithPassword(credentials as any);
      if (error) throw error;

      // Lấy user mới nhất sau login
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;

      const level = await fetchAdminLevel(uid);
      setAdminLevel(level);

      setAuthMsg("✅ Đăng nhập thành công!");

      if (level === 1) {
        // Level 1: mở modal chọn trang (admin / list)
        setIsAdmin(true);
        closeAuth();
        setPostLoginOpen(true);
      } else if (level === 2) {
        // Level 2: đăng nhập được, nhưng KHÔNG có 2 chức năng bị chặn
        setIsAdmin(true);
        closeAuth();
        // không mở postLoginOpen vì modal chỉ dành cho level 1
      } else {
        // không phải admin (không có trong admin_users)
        setIsAdmin(false);
        setAuthMsg("⛔ Tài khoản không có quyền Admin.");
        await supabase.auth.signOut();
      }

      setUserMenuOpen(false);
    } catch (e: any) {
      setAuthMsg(`❌ Đăng nhập thất bại: ${e?.message ?? "Lỗi không xác định"}`);
    } finally {
      setAuthLoading(false);
    }
  };

  /* ================== FETCH FILTER OPTIONS (RPC) ================== */
useEffect(() => {
  const fetchFilters = async () => {
    const { data, error } = await supabase.rpc("get_public_filters");
    if (error || !data) return;

    setDistricts((data.districts ?? []) as string[]);
    setRoomTypes((data.roomTypes ?? []) as string[]);
  };

  fetchFilters();
}, []);


  /* ================== FETCH PAGE (CURSOR / CACHE BY PAGE) ================== */
const fetchPage = useCallback(
  async (targetIndex: number) => {
    // ✅ FIX race condition: chưa biết role thì không fetch
    if (!roleReady) return;

    // ✅ đã có cache trang này thì không fetch
    if (pagesRef.current[targetIndex]) return;

    if (loading) return;

    setLoading(true);
    setFetchError("");

    // ✅ PERF/UX: chỉ show skeleton nếu loading kéo dài > 300ms
    
    setShowSkeleton(false);
    const t = setTimeout(() => {
     
    }, 300);

    const reqId = ++requestIdRef.current;

    try {
      console.log("fetchPage adminLevel =", adminLevel, "page =", targetIndex);

      const res = await fetchRooms({
        limit: LIMIT,
        cursor: cursorsRef.current[targetIndex] ?? null,
        adminLevel: adminLevel === 1 ? 1 : adminLevel === 2 ? 2 : 0,
        search: effectiveSearch || undefined,
        minPrice: priceApplied[0],
        maxPrice: priceApplied[1],
        sortMode,
        districts: selectedDistricts.length > 0 ? selectedDistricts : undefined,
        roomTypes: selectedRoomTypes.length ? selectedRoomTypes : undefined,
        move: moveFilter ?? undefined,
      });

      // ✅ chỉ nhận response mới nhất (chống bấm nhanh / filter đổi)
      if (reqId !== requestIdRef.current) return;

      const data = res?.data ?? [];
      const next = res?.nextCursor ?? null;

      setPages((prev) => {
        const copy = prev.slice();
        copy[targetIndex] = data;
        pagesRef.current = copy;
        return copy;
      });

      // cursor để fetch trang tiếp theo
      cursorsRef.current[targetIndex + 1] = next;

      setHasNext(Boolean(next));
    } catch (err: any) {
      if (reqId !== requestIdRef.current) return;
      setFetchError("Mạng yếu hoặc server bận. Vui lòng thử lại.");
    } finally {
      if (reqId !== requestIdRef.current) return;

            clearTimeout(t);
      setLoading(false);
      setShowSkeleton(false);
    }
  },
  [
    roleReady,
    loading,
    LIMIT,
    adminLevel,
    effectiveSearch,
    priceApplied,
    selectedDistricts,
    selectedRoomTypes,
    moveFilter,
    sortMode,
  ]
);

const resetPagination = useCallback(() => {
  // invalidate request cũ nếu có
  requestIdRef.current++;

  setPages([]);
  pagesRef.current = [];
  setPageIndex(0);
  setHasNext(true);
  cursorsRef.current = [null];
}, []);

const goNext = useCallback(async () => {
  if (!hasNext || loading) return;

  const nextIndex = pageIndex + 1;

  // nếu chưa có cache trang sau -> fetch rồi mới chuyển
  await fetchPage(nextIndex);
  setPageIndex(nextIndex);

  // UX: nếu muốn về đầu danh sách khi đổi trang:
  // window.scrollTo({ top: 0, behavior: "smooth" });
}, [hasNext, loading, pageIndex, fetchPage]);

const goPrev = useCallback(() => {
  if (loading) return;
  if (pageIndex === 0) return;

  setPageIndex((i) => i - 1);

  // window.scrollTo({ top: 0, behavior: "smooth" });
}, [loading, pageIndex]);

  useEffect(() => {
  if (!roleReady) return;

  const hasSSR = hasSSRInitialRef.current;
  const sameRole = adminLevel === initialAdminLevel;

  if (hasSSR && sameRole) return;

  resetPagination();
  fetchPage(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [roleReady, adminLevel, initialAdminLevel]);

  // Reset pagination khi filter thay đổi (dùng debounced để tránh reset liên tục)
useEffect(() => {
  if (!roleReady) return;

  // Skip the very first run after mount/hydration
  if (skipFirstFilterEffectRef.current) {
    skipFirstFilterEffectRef.current = false;
    return;
  }

  resetPagination();
  fetchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [roleReady, debouncedSearch, priceApplied, selectedDistricts, selectedRoomTypes, moveFilter, sortMode]);

  useEffect(() => {
    if (openFilter === null) return;

    const activeEl =
      openFilter === "district"
        ? districtDetailsRef.current
        : openFilter === "roomType"
          ? roomTypeDetailsRef.current
          : moveDetailsRef.current;

    const onPointerDownCapture = (e: PointerEvent) => {
      // tap/click outside details => close
      if (!activeEl) return closeAllFilters();
      const target = e.target as Node | null;
      if (target && activeEl.contains(target)) return; // inside => keep open
      closeAllFilters();
    };

    // Only close on scroll for touch devices (mobile/tablet) to keep desktop UX nice
    const isTouchDevice =
      typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0;

    const onScroll = () => closeAllFilters();

    document.addEventListener("pointerdown", onPointerDownCapture, true); // capture is key
    if (isTouchDevice) window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      if (isTouchDevice) window.removeEventListener("scroll", onScroll);
    };
  }, [openFilter]);

  const roomsToRender = pages[pageIndex] ?? [];

  return (
    <>
      {/* HERO */}
<header className="relative z-50 h-[200px] md:h-[300px]">
  {/* Layer ảnh (có thể overflow-hidden để giữ ảnh gọn/bo góc) */}
  <div className="absolute inset-0 overflow-hidden">
    <img
      src="/hero.jpg"
      alt="KL.G"
      className="absolute inset-0 w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-black/10" />
  </div>

  {/* KLG + Tài khoản ở góc trái dưới (không bị cắt) */}
  <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 z-50 flex flex-col items-start gap-3">
    <h1 className="text-4xl md:text-5xl font-bold text-white">KL.G</h1>

    {/* Login/Logout button */}
    {user ? (
      <div className="relative">
        <button
          ref={accountBtnRef}
          onClick={() => {
            setUserMenuOpen((v: boolean) => {
              const next = !v;
              // nếu mở menu thì tính vị trí ngay
              if (!v) requestAnimationFrame(updateMenuPos);
              return next;
            });
          }}
          className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium hover:bg-white"
          title={user?.email || user?.phone || "Đã đăng nhập"}
        >
          Tài khoản ▾
        </button>

        {userMenuOpen &&
          menuPos &&
          createPortal(
            <div
              ref={userMenuRef}
              className="fixed z-[999999] w-fit min-w-[140px] rounded-xl border bg-white shadow p-1"

              style={{ left: menuPos.left, top: menuPos.top }}
            >
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/admin");
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Admin 
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Home 
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  handleLogout();
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Đăng xuất
              </button>
            </div>,
            document.body
          )}
      </div>
    ) : (
      <button
        onClick={openAuth}
        className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium hover:bg-white"
      >
        Đăng nhập
      </button>
    )}
  </div>
</header>

      {/* AUTH MODAL */}
      {authOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeAuth}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Đăng nhập</h2>
              <button onClick={closeAuth} className="text-gray-500 hover:text-black">
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  authMode === "email" ? "bg-black text-white" : "bg-white"
                }`}
                onClick={() => {
                  setAuthMode("email");
                  setAuthMsg("");
                  setPassword("");
                }}
              >
                Email
              </button>
              <button
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  authMode === "phone" ? "bg-black text-white" : "bg-white"
                }`}
                onClick={() => {
                  setAuthMode("phone");
                  setAuthMsg("");
                  setPassword("");
                }}
              >
                Số điện thoại
              </button>
            </div>

            {authMode === "email" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vd: tenban@gmail.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Số điện thoại</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="vd: +84901234567"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500">Nhập theo định dạng quốc tế (+84…)</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <button
              disabled={!canLogin || authLoading}
              onClick={handleLogin}
              className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {authLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>

            {authMsg && (
              <div className="text-sm whitespace-pre-line text-gray-700">{authMsg}</div>
            )}
          </div>
        </div>
      )}

      {/* POST-LOGIN MODAL (chỉ admin_l1) */}
      {postLoginOpen && isAdminL1 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setPostLoginOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Chọn trang</h2>
              <button
                onClick={() => setPostLoginOpen(false)}
                className="text-gray-500 hover:text-black"
              >
                ✕
              </button>
            </div>

            <a
              href="/admin"
              className="block w-full rounded-lg bg-black px-3 py-2 text-center text-sm font-medium text-white"
            >
            Admin 
                      </a>

            <button
              className="w-full rounded-lg border px-3 py-2 text-sm font-medium"
              onClick={() => setPostLoginOpen(false)}
            >
              Xem danh sách phòng
            </button>
          </div>
        </div>
      )}
<div className="min-h-screen bg-gray-200">
      {/* FILTER */}
      <section className="container mx-auto px-4 py-6 space-y-5">
        <div className="flex w-full items-start gap-2">
          <div className="flex flex-wrap gap-2">
          {/* QUẬN (multi-select) */}
          <details
            ref={districtDetailsRef}
            className="relative"
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpenFilter(isOpen ? "district" : null);

              if (isOpen) {
                roomTypeDetailsRef.current?.removeAttribute("open");
                moveDetailsRef.current?.removeAttribute("open");
              }
            }}
          >
            <summary
              className={`list-none cursor-pointer select-none px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Quận
              {selectedDistricts.length > 0 && (
                <span className="text-xs text-gray-500">({selectedDistricts.length})</span>
              )}
            </summary>

            <div
              className="absolute z-20 mt-2 w-64 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Chọn quận</div>
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-black"
                  onClick={() => setSelectedDistricts([])}
                >
                  Clear
                </button>
              </div>

              <div className="max-h-64 overflow-auto space-y-1">
                {districts.map((d: string) => {
                  const checked = selectedDistricts.includes(d);
                  return (
                    <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedDistricts((prev: string[]) =>
                            checked ? prev.filter((x: string) => x !== d) : [...prev, d]
                          );
                        }}
                      />
                      <span>{d}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>

          {/* LOẠI PHÒNG (multi-select) */}
          <details
            ref={roomTypeDetailsRef}
            className="relative"
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpenFilter(isOpen ? "roomType" : null);

              if (isOpen) {
                districtDetailsRef.current?.removeAttribute("open");
                moveDetailsRef.current?.removeAttribute("open");
              }
            }}
          >
            <summary
              className={`list-none cursor-pointer select-none px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Loại phòng
              {selectedRoomTypes.length > 0 && (
                <span className="text-xs text-gray-500">({selectedRoomTypes.length})</span>
              )}
            </summary>

            <div
              className="absolute z-20 mt-2 w-64 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Chọn loại phòng</div>
                <button
                  type="button"
                  className="text-xs text-gray-600 hover:text-black"
                  onClick={() => setSelectedRoomTypes([])}
                >
                  Clear
                </button>
              </div>

              <div className="max-h-64 overflow-auto space-y-1">
                {roomTypes.map((t: string) => {
                  const checked = selectedRoomTypes.includes(t);
                  return (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedRoomTypes((prev: string[]) =>
                            checked ? prev.filter((x: string) => x !== t) : [...prev, t]
                          );
                        }}
                      />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>

          {/* DI CHUYỂN (single-select) */}
          <details
            ref={moveDetailsRef}
            className="relative"
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpenFilter(isOpen ? "move" : null);

              if (isOpen) {
                districtDetailsRef.current?.removeAttribute("open");
                roomTypeDetailsRef.current?.removeAttribute("open");
              }
            }}
          >
            <summary
              className={`list-none cursor-pointer select-none px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 flex items-center gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              Di chuyển
              {moveFilter && <span className="text-xs text-gray-500">({moveFilter})</span>}
            </summary>

            <div
              className="absolute z-20 mt-2 w-56 rounded-xl border bg-white shadow p-3 space-y-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium">Chọn 1</div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="moveFilter"
                  checked={moveFilter === null}
                  onChange={() => setMoveFilter(null)}
                />
                <span>Tất cả</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="moveFilter"
                  checked={moveFilter === "elevator"}
                  onChange={() => setMoveFilter("elevator")}
                />
                <span>Thang máy</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="moveFilter"
                  checked={moveFilter === "stairs"}
                  onChange={() => setMoveFilter("stairs")}
                />
                <span>Thang bộ</span>
              </label>
            </div>
          </details>
          </div>

          <details ref={sortDetailsRef} className="ml-auto">
  <summary className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium">
    Sort
  </summary>

  <div className="mt-2 w-56 rounded-xl border bg-white shadow overflow-hidden">
    <div className="flex items-center justify-between">
      <button
        type="button"
        className="flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
        onClick={() => {
          setSortMode("price_asc");
          sortDetailsRef.current?.removeAttribute("open");
        }}
      >
        Giá: Thấp -&gt; Cao
      </button>

      <button
        type="button"
        className={`px-3 py-2 text-sm ${
          sortMode !== "updated_desc"
            ? "text-sky-600 hover:underline"
            : "text-gray-400 cursor-not-allowed"
        }`}
        disabled={sortMode === "updated_desc"}
        onClick={() => {
          setSortMode("updated_desc");
          sortDetailsRef.current?.removeAttribute("open");
        }}
      >
        Clear
      </button>
    </div>

    <button
      type="button"
      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
      onClick={() => {
        setSortMode("price_desc");
        sortDetailsRef.current?.removeAttribute("open");
      }}
    >
      Giá: Cao -&gt; Thấp
    </button>
  </div>
</details>


        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            adminLevel >= 1
              ? "Tìm theo số nhà, địa chỉ, phường..."
              : "Tìm theo địa chỉ, phường..."
          }
          className={`w-full border rounded-lg px-4 py-2 text-sm ${
            loading ? "opacity-60" : ""
          }`}
        />

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>{priceDraft[0].toLocaleString("vi-VN")} đ</span>
            <span>{priceDraft[1].toLocaleString("vi-VN")} đ</span>

          </div>

          <Slider.Root
            min={3_000_000}
            max={30_000_000}
            step={500_000}
            value={priceDraft}
            onValueChange={(v) => setPriceDraft(v as [number, number])}
            onValueCommit={(v) => {
              const next = v as [number, number];
              setPriceDraft(next);
              setPriceApplied(next);
            }}
            className={`relative flex items-center select-none h-5 ${
              loading ? "opacity-60" : ""
            }`}
          >
            <Slider.Track className="bg-gray-300 relative grow rounded-full h-1">
              <Slider.Range className="absolute bg-black h-full rounded-full" />
            </Slider.Track>
            <Slider.Thumb className="block w-4 h-4 bg-black rounded-full" />
            <Slider.Thumb className="block w-4 h-4 bg-black rounded-full" />
          </Slider.Root>
        </div>
      </section>
      {/* LIST */}
      <main className="container mx-auto px-4 pb-10">
        {fetchError && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
            {fetchError}
          </div>
        )}

        {showSkeleton ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <RoomCardSkeleton key={i} />
            ))}
          </div>
        ) : roomsToRender.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roomsToRender.map((room) => (
  <RoomCard
    key={room.id ?? room.room_code}
    room={room}
    adminLevel={adminLevel}
  />
))}
            </div>

            <div className="flex items-center justify-center gap-4 mt-8">
  <button
    disabled={pageIndex === 0 || loading}
    onClick={goPrev}
    className="px-4 py-2 border rounded disabled:opacity-40"
  >
    Trang trước
  </button>

  <button
    disabled={!hasNext || loading}
    onClick={goNext}
    className="px-4 py-2 border rounded disabled:opacity-40"
  >
    {loading ? "Đang tải..." : "Trang sau"}
  </button>
</div>
          </>
        ) : loading ? null : (
          <p className="text-center text-gray-500 py-20">Không có phòng phù hợp</p>
        )}
      </main>
      </div>
    </>
  );
}