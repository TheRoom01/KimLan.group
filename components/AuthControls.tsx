"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

type AuthView = "login" | "forgot" | "sent";

function getDeviceLabel(d: any) {
  const rawOriginal = [
    d?.device_name,
    d?.user_agent,
    d?.platform,
    d?.browser,
    d?.device_fingerprint,
  ]
    .filter(Boolean)
    .join(" ");

  const raw = rawOriginal.toLowerCase();

  // ===== iOS =====
  // Web thường không lấy được model chính xác kiểu iPhone 17 Pro.
  if (raw.includes("iphone")) return "iPhone";
  if (raw.includes("ipad")) return "iPad";

  // ===== Samsung =====
  const samsungModel = rawOriginal.match(/\bSM-[A-Z0-9]+/i)?.[0];
  if (samsungModel) return `Samsung ${samsungModel.toUpperCase()}`;
  if (raw.includes("samsung")) return "Samsung";

  // ===== Google Pixel =====
  const pixelModel = rawOriginal.match(/\bPixel\s?[A-Za-z0-9\s]+/i)?.[0];
  if (pixelModel) return pixelModel.trim();

  // ===== Xiaomi / Redmi / POCO =====
  if (raw.includes("redmi")) return "Redmi";
  if (raw.includes("poco")) return "POCO";
  if (raw.includes("xiaomi") || raw.includes("miui")) return "Xiaomi";

  // ===== OPPO / Realme / Vivo =====
  if (raw.includes("oppo")) return "OPPO";
  if (raw.includes("realme")) return "Realme";
  if (raw.includes("vivo")) return "Vivo";

  // ===== Android chung =====
  if (raw.includes("android") || raw.includes("mobile")) {
    return "Điện thoại Android";
  }

  // ===== Desktop =====
  if (raw.includes("windows")) return "Máy tính Windows";
  if (raw.includes("macintosh") || raw.includes("mac os")) return "Mac";
  if (raw.includes("linux")) return "Máy tính Linux";

  return "Máy tính";
}

function formatLastSeen(value: any) {
  if (!value) return "Không rõ";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Không rõ";

  return d.toLocaleString("vi-VN");
}

export default function AuthControls() {
  const router = useRouter();
  const pathname = usePathname();

  const isOwnerPortal = pathname.startsWith("/owner");

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [user, setUser] = useState<any>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState("");

  const [showDeviceManager, setShowDeviceManager] = useState(false);

  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const loginLockRef = useRef(false);

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
      // nếu đang mở device manager thì không reset UI login state
      if (showDeviceManager) return;

      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

    // ===== show message when device limit related redirect =====
useEffect(() => {
  if (typeof window === "undefined") return;
  if (user) return; // đã login thì không mở modal

  const sp = new URLSearchParams(window.location.search);
  const authType = sp.get("auth");
  

  if (!authType) return;

  setAuthView("login");

  if (authType === "kicked") {
    // Thiết bị này bị đá ra do thiết bị khác login
    setAuthMsg(
      "Phiên đăng nhập trên thiết bị này đã bị đăng xuất vì tài khoản vượt quá 2 thiết bị."
    );
  } else if (authType === "limit") {
    // Thiết bị thứ 3 bị chặn login
    setAuthMsg(
      "Tài khoản đã đăng nhập trên 2 thiết bị. Vui lòng đăng xuất 1 thiết bị để tiếp tục."
    );
  }

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
  if (loginLockRef.current) return;
  loginLockRef.current = true;

  if (!canLogin) {
    loginLockRef.current = false;
    return;
  }

  setAuthLoading(true);
  setAuthMsg("");

  const doLogin = async () => {
    return supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
  };

  try {
    let { error } = await doLogin();

    if (error) {
      setAuthLoading(false);
      setAuthMsg(error.message);
      loginLockRef.current = false;
      return;
    }

    const r = await fetch("/api/device/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        forceEvict: false,
      }),
    });

    // ❌ vượt limit → mở device manager, KHÔNG logout
    if (r.status === 403) {
      const s = await fetch("/api/device/list");
      const body = await s.json();

      setDevices(body?.devices || []);
      setShowDeviceManager(true);

      setAuthLoading(false);
      loginLockRef.current = false;
      return;
    }

    // ❌ lỗi register → retry flow
    if (!r.ok) {
      await fetch("/api/device/logout", { method: "POST" });

      const retry = await doLogin();

      if (retry.error) {
        await supabase.auth.signOut();
        setAuthLoading(false);
        setAuthMsg(retry.error.message || "Login failed");
        loginLockRef.current = false;
        return;
      }

      const r2 = await fetch("/api/device/register", { method: "POST" });

      if (!r2.ok) {
        await supabase.auth.signOut();
        setAuthLoading(false);
        setAuthMsg("Không thể đăng ký thiết bị sau retry");
        loginLockRef.current = false;
        return;
      }
    }

    await fetchDevices().catch(() => {});

    setAuthLoading(false);
    closeAuth();
    loginLockRef.current = false;
  } catch {
    await supabase.auth.signOut();
    setAuthLoading(false);
    setAuthMsg("Lỗi mạng khi đăng nhập");
    loginLockRef.current = false;
  }
};

const handleLogout = async () => {
  try {
    await fetch("/api/device/logout", { method: "POST" });
  } catch {}

  await supabase.auth.signOut();

  setMenuOpen(false);
  setDevices([]);
  setShowDeviceManager(false);
  setUser(null);

  // 🔥 tránh UI “kẹt state” khi Supabase delay
  setAuthOpen(false);
  setAuthMsg("");

  router.refresh();
};

const fetchDevices = async () => {
  setLoadingDevices(true);

  try {
    const res = await fetch("/api/device/list");
    const json = await res.json();

    if (json?.ok) {
      setDevices(json.devices || []);
    } else {
      setDevices([]);
    }
  } catch {
    setDevices([]);
  } finally {
    setLoadingDevices(false);
  }
};

const handleSendReset = async () => {
  const target = (forgotEmail || email).trim();

  if (!target.includes("@")) return;

  setAuthLoading(true);
  setAuthMsg("");

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    window.location.origin;

  const { error } = await supabase.auth.resetPasswordForEmail(target, {
    redirectTo: `${siteUrl}/auth/reset-password`,
  });

  if (error) {
    console.error("RESET PASSWORD ERROR:", error);
    setAuthMsg(error.message);
    setAuthLoading(false);
    return;
  }

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

  const MENU_WIDTH = 360;

  const [menuPos, setMenuPos] = useState<{
    right: number;
    top: number;
    width: number;
  }>({
    right: 8,
    top: 0,
    width: MENU_WIDTH,
  });

  const updateMenuPos = () => {
    const btn = btnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const viewportW = window.innerWidth;

    const width = Math.min(MENU_WIDTH, viewportW - 16);

    const rawRight = viewportW - r.right;
    const maxRight = Math.max(8, viewportW - width - 8);

    setMenuPos({
      right: Math.min(Math.max(8, Math.round(rawRight)), maxRight),
      top: Math.round(r.bottom + 8),
      width,
    });
  };

 const openMenu = () => {
  updateMenuPos();
  setMenuOpen(true);
  fetchDevices();
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
              className="
                fixed z-[9999]
                max-h-[72vh] overflow-y-auto
                rounded-3xl border border-white/35
                bg-[linear-gradient(rgba(255,255,255,0.12),rgba(255,255,255,0.05))]
                p-2 text-white
                backdrop-blur-[45px]
                shadow-[0_35px_120px_rgba(0,0,0,0.75),0_0_50px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.45)]
              "
              style={{
                right: menuPos.right,
                top: menuPos.top,
                width: menuPos.width,
                maxWidth: "calc(100vw - 16px)",
              }}
            >
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  router.push("/admin");
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-white/85
hover:bg-white/10 hover:text-white rounded-xl transition-all"
              >
                Admin
              </button>

              <a
                href="https://canhodichvu.pro/admin/zalo-imports"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="block w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold text-white/85 transition-all hover:bg-white/10 hover:text-white"
              >
                Trang duyệt phòng
              </a>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setChangePwOpen(true);
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-white/85
hover:bg-white/10 hover:text-white rounded-xl transition-all"
              >
                Đổi mật khẩu
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  handleLogout();
                }}
                className="
                  block w-full whitespace-nowrap rounded-xl
                  px-3 py-2 text-left text-sm font-semibold
                  text-red-300 transition-all
                  hover:bg-red-500/10 hover:text-red-200
                "
              >
                Đăng xuất
              </button>

              <div className="px-3 py-2 text-xs text-white/60">
                Thiết bị đang đăng nhập
              </div>

              {loadingDevices ? (
                <div className="px-3 py-2 text-xs text-white/50">Đang tải...</div>
              ) : devices.length === 0 ? (
                <div className="px-3 py-2 text-xs text-white/50">
                  Chưa có thiết bị nào.
                </div>
              ) : (
                devices.map((d) => (
                  <div key={d.id} className="px-1 py-1">
                    <div className="flex items-start justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {getDeviceLabel(d)}
                        </div>

                        <div className="mt-1 text-[11px] text-white/50">
                          last seen: {formatLastSeen(d.last_seen_at)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="
                          shrink-0 rounded-xl px-2.5 py-1
                          text-xs font-semibold text-red-300
                          transition hover:bg-red-500/10 hover:text-red-200
                          pointer-events-auto relative z-[99999]
                        "
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          await fetch("/api/device/revoke", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ token_hash: d.token_hash }),
                          });

                          await fetchDevices();
                        }}
                      >
                        đăng xuất
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

    /**
   * Owner Portal có auth gate riêng.
   * Không render nút tài khoản và modal auth của website chính tại /owner.
   *
   * Điều kiện này phải đặt sau toàn bộ hook để không vi phạm Rules of Hooks.
   */
  if (isOwnerPortal) {
    return null;
  }

  // ===== controls (portal to #auth-anchor) =====
const controls = (
  <div className="relative z-[9999] flex items-center gap-3 pointer-events-auto">
    {user ? (
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          className="
            inline-flex items-center justify-center gap-1
            h-[36px] min-w-[118px]
            px-4
            rounded-2xl border border-white/30
            bg-[linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.015))]
            text-[13px] font-semibold leading-none text-white
            backdrop-blur-[30px]
            shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)]
            hover:bg-[rgba(255,255,255,0.1)]
            transition-all
            whitespace-nowrap
          "
          title={user?.email || "Đã đăng nhập"}
        >
          <span>Tài khoản</span>
          <span className="text-[10px] leading-none">▼</span>
        </button>
      </div>
    ) : (
      <button
        onClick={openAuth}
        className="
          inline-flex items-center justify-center
          h-[36px] min-w-[118px]
          px-4
          rounded-2xl border border-white/30
          bg-[linear-gradient(rgba(255,255,255,0.05),rgba(255,255,255,0.015))]
          text-[13px] font-semibold leading-none text-white
          backdrop-blur-[30px]
          shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)]
          hover:bg-[rgba(255,255,255,0.1)]
          transition-all
          whitespace-nowrap
        "
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

      {showDeviceManager && (
  <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center">
    <div className="bg-white w-full max-w-md rounded-xl p-4 space-y-3">
      <h2 className="text-lg font-semibold">
        Quản lý thiết bị đăng nhập
      </h2>

      {devices.length === 0 ? (
        <div className="text-sm text-gray-600">
          Không tải được danh sách thiết bị
        </div>
      ) : (
        devices.map((d) => (
          <div
            key={d.id}
            className="flex justify-between items-center border-b py-2"
          >
            <div className="text-sm">
              <div className="text-sm font-medium">
                {getDeviceLabel(d)}
              </div>
              <div className="text-xs text-gray-500">
                last seen: {formatLastSeen(d.last_seen_at)}
              </div>
            </div>

            <button
              className="text-xs text-red-300 hover:text-red-200 pointer-events-auto relative z-[99999]"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();

                await fetch("/api/device/revoke", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ token_hash: d.token_hash }),
                });

                await fetchDevices();
              }}
            >
              đăng xuất
            </button>
          </div>
        ))
      )}

      <button
        className="w-full mt-3 bg-black text-white rounded-lg py-2 text-sm"
        onClick={() => setShowDeviceManager(false)}
      >
        Đóng
      </button>
    </div>
  </div>
)}
    </>
  );
}
