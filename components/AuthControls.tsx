"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

type AuthView = "login" | "forgot" | "sent";

export default function AuthControls() {
  const router = useRouter();
  const pathname = usePathname();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [user, setUser] = useState<any>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);

  const [changePwOpen, setChangePwOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const canLogin = useMemo(
    () => email.includes("@") && password.length >= 6,
    [email, password]
  );

  // ===== auth session (SAFE + NO AUTO REFRESH) =====
  useEffect(() => {
    let mounted = true;

    // 1️⃣ Lấy session ban đầu
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    });

    // 2️⃣ Lắng nghe thay đổi auth
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

    // ===== show message when kicked by device limit =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user) return; // đã login thì không mở modal

    const sp = new URLSearchParams(window.location.search);
    const kicked = sp.get("auth") === "kicked";
    if (!kicked) return;

    // mở modal + show message
    setAuthView("login");
    setAuthMsg("Phiên đăng nhập trên thiết bị này đã bị đăng xuất vì tài khoản vượt quá 2 thiết bị.");
    setAuthOpen(true);

    // remove auth param to avoid repeated popup
    sp.delete("auth");
    const nextQs = sp.toString();
    const url = nextQs ? `${pathname}?${nextQs}` : pathname;
    router.replace(url, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user]);

  // ===== find #auth-anchor (portal target) =====
  useEffect(() => {
    let raf = 0;
    let obs: MutationObserver | null = null;
    let stopped = false;

    const tryFind = () => {
      const el = document.getElementById("auth-anchor") as HTMLElement | null;
      if (el) {
        setAnchorEl(el);
        return true;
      }
      return false;
    };

    const cleanup = () => {
      stopped = true;
      if (obs) obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };

    if (tryFind()) return () => {};

    setAnchorEl((prev) => {
      if (!prev) return prev;
      if ((prev as any).isConnected === false) return null;
      if (!document.contains(prev)) return null;
      return prev;
    });

    obs = new MutationObserver(() => {
      if (stopped) return;
      if (tryFind()) cleanup();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const tick = () => {
      if (stopped) return;
      if (!tryFind()) raf = requestAnimationFrame(tick);
      else cleanup();
    };
    raf = requestAnimationFrame(tick);

    return cleanup;
  }, [pathname]);

  // ===== open/close auth modal =====
  const openAuth = () => {
    setAuthMsg("");
    setPassword("");
    setForgotEmail(email);
    setAuthView("login");
    setAuthOpen(true);
  };

  const closeAuth = () => {
    setAuthOpen(false);
    setAuthMsg("");
    setPassword("");
    setAuthView("login");
  };

  // ===== login/logout/reset =====
  const handleLogin = async () => {
  if (!canLogin) return;

  setAuthLoading(true);
  setAuthMsg("");

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  });

  if (error) {
    setAuthLoading(false);
    setAuthMsg(error.message);
    return;
  }

  // 2) Register this browser as a "device" (enforce max 2 devices)
  try {
    const r = await fetch("/api/device/register", { method: "POST" });

    if (r.status === 403) {
      // limit reached / got kicked: logout immediately
      await supabase.auth.signOut();
      setAuthLoading(false);
      setAuthMsg("Tài khoản đã đăng nhập trên 2 thiết bị. Vui lòng đăng xuất 1 thiết bị để tiếp tục.");
      return;
    }

    if (!r.ok) {
      const body = await r.json().catch(() => ({} as any));
      await supabase.auth.signOut();
      setAuthLoading(false);
      setAuthMsg(body?.error || "Không thể đăng ký thiết bị. Vui lòng thử lại.");
      return;
    }
  } catch {
    await supabase.auth.signOut();
    setAuthLoading(false);
    setAuthMsg("Không thể đăng ký thiết bị (lỗi mạng). Vui lòng thử lại.");
    return;
  }

  setAuthLoading(false);

  // ✅ KHÔNG router.refresh() để tránh remount -> trắng/skeleton
  closeAuth();
};

  const handleLogout = async () => {
    // ✅ KHÔNG router.refresh() để tránh remount -> trắng/skeleton
    await supabase.auth.signOut();
    setMenuOpen(false);
  };

  const handleSendReset = async () => {
    const target = (forgotEmail || email).trim();
    if (!target.includes("@")) return;

    setAuthLoading(true);
    setAuthMsg("");

    await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    });

    setAuthLoading(false);
    setAuthView("sent");
  };

  const handleChangePassword = async () => {
    setPwMsg("");

    if (newPw.length < 8) {
      setPwMsg("Mật khẩu mới tối thiểu 8 ký tự");
      return;
    }
    if (newPw !== newPw2) {
      setPwMsg("Mật khẩu xác nhận không khớp");
      return;
    }

    setPwLoading(true);

    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: (user?.email || email || "").trim(),
      password: oldPw,
    });

    if (reAuthError) {
      setPwLoading(false);
      setPwMsg("Mật khẩu cũ không đúng");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });

    setPwLoading(false);

    if (error) {
      setPwMsg(error.message);
      return;
    }

    setChangePwOpen(false);
    setOldPw("");
    setNewPw("");
    setNewPw2("");
  };

  // ==========================================================
  // FIX: dropdown "Tài khoản" luôn nổi trên FilterBar sticky
  // - Menu render bằng createPortal ra document.body
  // - position: fixed theo rect của button
  // ==========================================================
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number; minW: number }>({
    left: 0,
    top: 0,
    minW: 170,
  });

  const updateMenuPos = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setMenuPos({
      left: Math.round(r.left),
      top: Math.round(r.bottom + 8),
      minW: Math.max(170, Math.round(r.width)),
    });
  };

  const openMenu = () => {
    updateMenuPos();
    setMenuOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  // close menu on outside click + ESC, keep pos on scroll/resize
  useEffect(() => {
    if (!menuOpen) return;

    const onDocDown = (e: MouseEvent | PointerEvent) => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      const t = e.target as Node | null;

      if (btn && t && btn.contains(t)) return;
      if (menu && t && menu.contains(t)) return;

      closeMenu();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    const onReflow = () => updateMenuPos();

    document.addEventListener("pointerdown", onDocDown, { capture: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true); // capture scroll từ mọi container

    return () => {
      document.removeEventListener("pointerdown", onDocDown, true as any);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const menuPortal =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] inline-block rounded-xl border bg-white shadow"
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  router.push("/admin");
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Admin
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setChangePwOpen(true);
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Đổi mật khẩu
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  handleLogout();
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Đăng xuất
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  // ===== controls (portal to #auth-anchor) =====
  const controls = (
    <div className="flex items-center gap-3">
      {user ? (
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium hover:bg-white"
            title={user?.email || "Đã đăng nhập"}
          >
            Tài khoản ▾
          </button>
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
  );

  return (
    <>
      {anchorEl ? createPortal(controls, anchorEl) : null}
      {menuPortal}

      {/* AUTH MODAL */}
      {authOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
          onClick={closeAuth}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {authView === "login"
                  ? "Đăng nhập"
                  : authView === "forgot"
                    ? "Quên mật khẩu"
                    : "Kiểm tra email"}
              </h2>
              <button onClick={closeAuth} className="text-gray-500 hover:text-black">
                ✕
              </button>
            </div>

            {/* LOGIN */}
            {authView === "login" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
                className="space-y-3"
              >
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  className="text-sm text-blue-600 hover:underline text-left"
                  onClick={() => {
                    setForgotEmail(email);
                    setAuthView("forgot");
                  }}
                >
                  Quên mật khẩu?
                </button>

                <button
                  type="submit"
                  disabled={!canLogin || authLoading}
                  className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {authLoading ? "Đang đăng nhập..." : "Đăng nhập"}
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD */}
            {authView === "forgot" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendReset();
                }}
                className="space-y-3"
              >
                <input
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Nhập email"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {authLoading ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
                </button>

                <button
                  type="button"
                  className="w-full text-sm text-gray-600"
                  onClick={() => setAuthView("login")}
                >
                  Quay lại đăng nhập
                </button>
              </form>
            )}

            {/* SENT */}
            {authView === "sent" && (
              <div className="space-y-3">
                <div className="text-sm text-gray-700">
                  Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư (và cả spam).
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white"
                  onClick={closeAuth}
                >
                  Đóng
                </button>
              </div>
            )}

            {authMsg && <div className="text-sm whitespace-pre-line text-gray-700">{authMsg}</div>}
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {changePwOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
          onClick={() => setChangePwOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>

            <input
              type="password"
              placeholder="Mật khẩu cũ"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Mật khẩu mới"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Xác nhận mật khẩu mới"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />

            {pwMsg && <div className="text-sm text-red-600">{pwMsg}</div>}

            <button
              disabled={pwLoading}
              onClick={handleChangePassword}
              className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pwLoading ? "Đang xử lý..." : "Cập nhật mật khẩu"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
