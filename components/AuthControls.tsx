"use client";

import { useEffect, useMemo, useState } from "react";
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

  const canLogin = useMemo(() => email.includes("@") && password.length >= 6, [email, password]);
  useEffect(() => {
  let mounted = true;

  // lấy session hiện tại
  supabase.auth.getSession().then(({ data }) => {
    if (!mounted) return;
    setUser(data.session?.user ?? null);
  });

  // listen thay đổi auth
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
    // App Router: refresh để server components/props cập nhật
    router.refresh();
  });

  return () => {
    mounted = false;
    sub.subscription.unsubscribe();
  };
}, [router]);


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

  // 1️⃣ Nếu anchor đã có sẵn → set luôn và thoát effect
  if (tryFind()) return () => {};

  // 2️⃣ Nếu anchor cũ đã bị detach (back từ detail / rerender Home)
  setAnchorEl((prev) => {
    if (!prev) return prev;
    if ((prev as any).isConnected === false) return null;
    if (!document.contains(prev)) return null;
    return prev;
  });

  // 3️⃣ Observe DOM cho tới khi anchor xuất hiện
  obs = new MutationObserver(() => {
    if (stopped) return;
    if (tryFind()) cleanup();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // 4️⃣ Backup retry bằng RAF (phòng observer miss)
  const tick = () => {
    if (stopped) return;
    if (!tryFind()) raf = requestAnimationFrame(tick);
    else cleanup();
  };
  raf = requestAnimationFrame(tick);

  return cleanup;
}, [pathname]);

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

  const handleLogin = async () => {
    if (!canLogin) return;

    setAuthLoading(true);
    setAuthMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    setAuthLoading(false);

    if (error) {
      setAuthMsg(error.message);
      return;
    }

    closeAuth();
    router.refresh();

  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
     router.refresh();
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

  const controls = (
    <div className="flex items-center gap-3">
      {user ? (
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium hover:bg-white"
            title={user?.email || "Đã đăng nhập"}
          >
            Tài khoản ▾
          </button>

          {menuOpen && (
            <div className="absolute left-0 mt-2 w-[170px] rounded-xl border bg-white shadow p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/admin");
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Admin
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setChangePwOpen(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Đổi mật khẩu
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-gray-50"
              >
                Đăng xuất
              </button>
            </div>
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
  );

  return (
    <>
      {anchorEl ? createPortal(controls, anchorEl) : null}

      {authOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4" onClick={closeAuth}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {authView === "login" ? "Đăng nhập" : authView === "forgot" ? "Quên mật khẩu" : "Kiểm tra email"}
              </h2>
              <button onClick={closeAuth} className="text-gray-500 hover:text-black">✕</button>
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


            {authMsg && <div className="text-sm whitespace-pre-line text-gray-700">{authMsg}</div>}
          </div>
        </div>
      )}

      {changePwOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4" onClick={() => setChangePwOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
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
