"use client";

import {
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MonitorSmartphone,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

type AuthView = "login" | "register" | "verify-phone" | "forgot" | "sent";

type DeviceSession = {
  id?: string;
  device_name?: string | null;
  platform?: string | null;
  browser?: string | null;
  user_agent?: string | null;
  last_seen_at?: string | null;
};

type DeviceRegisterResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: string;
  devices?: DeviceSession[];
};

type DeviceRevokeResponse = {
  ok?: boolean;
  error?: string;
  devices?: DeviceSession[];
};

function normalizeVietnamAuthPhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) return `+84${digits.slice(1)}`;
  if (digits.startsWith("84")) {
    const national = digits.slice(2).replace(/^0+/, "");
    return `+84${national}`;
  }

  return `+${digits}`;
}

function getOwnerAuthError(error: unknown, fallback: string) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");

  if (/phone logins are disabled/i.test(message)) {
    return "Supabase chưa bật đăng nhập bằng số điện thoại. Hãy bật Phone Provider trong Authentication trước khi đăng ký hoặc đăng nhập Owner.";
  }

  if (/user already registered/i.test(message)) {
    return "Số điện thoại này đã có tài khoản. Hãy đăng nhập hoặc dùng chức năng Quên mật khẩu.";
  }

  if (/invalid login credentials/i.test(message)) {
    return "Số điện thoại hoặc mật khẩu không đúng.";
  }

  return message || fallback;
}

function getDeviceLabel(device: DeviceSession) {
  const raw = [
    device.device_name,
    device.platform,
    device.browser,
    device.user_agent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (raw.includes("iphone")) return "iPhone";
  if (raw.includes("ipad")) return "iPad";
  if (raw.includes("android")) return "Điện thoại Android";
  if (raw.includes("windows")) return "Máy tính Windows";
  if (raw.includes("macintosh") || raw.includes("mac os")) return "Máy Mac";
  if (raw.includes("linux")) return "Máy tính Linux";

  return device.device_name || device.platform || "Thiết bị";
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Không rõ";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Không rõ";
  }

  return date.toLocaleString("vi-VN");
}

export default function OwnerLoginGate() {
  const router = useRouter();
  const loginLockRef = useRef(false);

  const [authView, setAuthView] = useState<AuthView>("login");

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const canLogin = useMemo(() => {
    const normalizedPhone = normalizeVietnamAuthPhone(phone);
    return /^\+84\d{8,10}$/.test(normalizedPhone) && password.length >= 6;
  }, [phone, password]);

  const canRegister = useMemo(() => {
    const normalizedPhone = normalizeVietnamAuthPhone(registerPhone);

    return (
      registerName.trim().length >= 2 &&
      /^\+84\d{8,10}$/.test(normalizedPhone) &&
      registerPassword.length >= 6 &&
      registerPassword === registerPasswordConfirm
    );
  }, [
    registerName,
    registerPhone,
    registerPassword,
    registerPasswordConfirm,
  ]);

  async function registerCurrentDevice(): Promise<boolean> {
    const response = await fetch("/api/device/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        forceEvict: false,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | DeviceRegisterResponse
      | null;

    if (
      response.status === 403 &&
      payload?.status === "limit_reached"
    ) {
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setAuthMessage(
        payload.message ||
          "Tài khoản đã đăng nhập trên số thiết bị tối đa. Hãy đăng xuất một thiết bị để tiếp tục.",
      );

      return false;
    }

    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        payload?.error ||
          payload?.message ||
          "Không thể đăng ký thiết bị đăng nhập",
      );
    }

    setDevices([]);
    return true;
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canLogin || loginLockRef.current) {
      return;
    }

    loginLockRef.current = true;
    setAuthLoading(true);
    setAuthMessage("");
    setDevices([]);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        phone: normalizeVietnamAuthPhone(phone),
        password,
      });

      if (error) {
        throw error;
      }

      const deviceRegistered = await registerCurrentDevice();

      if (!deviceRegistered) {
        return;
      }

      /**
       * Sau khi đăng nhập thành công, refresh Server Component.
       * app/owner/layout.tsx sẽ đọc được session mới và render dashboard.
       */
      router.refresh();
    } catch (error) {
      await supabase.auth.signOut().catch(() => undefined);

      setAuthMessage(getOwnerAuthError(error, "Không thể đăng nhập Owner Portal"));
    } finally {
      setAuthLoading(false);
      loginLockRef.current = false;
    }
  }

  async function finishOwnerSession() {
    const deviceRegistered = await registerCurrentDevice();

    if (deviceRegistered) {
      router.refresh();
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedPhone = normalizeVietnamAuthPhone(registerPhone);

    if (registerName.trim().length < 2) {
      setAuthMessage("Vui lòng nhập họ tên.");
      return;
    }

    if (!/^\+84\d{8,10}$/.test(normalizedPhone)) {
      setAuthMessage("Vui lòng nhập số điện thoại Việt Nam hợp lệ.");
      return;
    }

    if (registerPassword.length < 6) {
      setAuthMessage("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setAuthMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");
    setDevices([]);

    try {
      const { data, error } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password: registerPassword,
        options: {
          data: {
            full_name: registerName.trim(),
            account_type: "owner",
          },
        },
      });

      if (error) {
        throw error;
      }

      setPhone(registerPhone);
      setPassword(registerPassword);

      if (data.session) {
        await finishOwnerSession();
      } else {
        setPhoneOtp("");
        setAuthView("verify-phone");
        setAuthMessage(
          "Mã xác minh đã được gửi đến số điện thoại. Nhập mã để hoàn tất đăng ký.",
        );
      }
    } catch (error) {
      setAuthMessage(
        getOwnerAuthError(error, "Không thể tạo tài khoản Owner"),
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedPhone = normalizeVietnamAuthPhone(registerPhone);
    const token = phoneOtp.replace(/\D/g, "").slice(0, 6);

    if (!/^\+84\d{8,10}$/.test(normalizedPhone)) {
      setAuthMessage("Số điện thoại đăng ký không hợp lệ.");
      return;
    }

    if (token.length !== 6) {
      setAuthMessage("Vui lòng nhập đủ mã xác minh 6 số.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token,
        type: "sms",
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error("Xác minh thành công nhưng chưa tạo được phiên đăng nhập.");
      }

      await finishOwnerSession();
    } catch (error) {
      setAuthMessage(
        getOwnerAuthError(error, "Mã xác minh không đúng hoặc đã hết hạn."),
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function resendPhoneOtp() {
    const normalizedPhone = normalizeVietnamAuthPhone(registerPhone);

    if (!/^\+84\d{8,10}$/.test(normalizedPhone)) {
      setAuthMessage("Số điện thoại đăng ký không hợp lệ.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const { error } = await supabase.auth.resend({
        type: "sms",
        phone: normalizedPhone,
      });

      if (error) {
        throw error;
      }

      setAuthMessage("Đã gửi lại mã xác minh.");
    } catch (error) {
      setAuthMessage(
        getOwnerAuthError(error, "Không thể gửi lại mã xác minh."),
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const targetEmail = forgotEmail.trim();

    if (!targetEmail.includes("@")) {
      setAuthMessage("Vui lòng nhập email hợp lệ");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        {
          redirectTo: `${siteUrl}/auth/reset-password`,
        },
      );

      if (error) {
        throw error;
      }

      setAuthView("sent");
    } catch (error) {
      setAuthMessage(
        getOwnerAuthError(error, "Không thể gửi email đặt lại mật khẩu"),
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function revokeDevice(sessionId: string) {
    setRevokingId(sessionId);
    setAuthMessage("");

    try {
      const response = await fetch("/api/device/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | DeviceRevokeResponse
        | null;

      if (!response.ok || payload?.ok !== true) {
        throw new Error(
          payload?.error || "Không thể đăng xuất thiết bị",
        );
      }

      setDevices(
        Array.isArray(payload.devices) ? payload.devices : [],
      );

      /**
       * Sau khi đã giải phóng một thiết bị, đăng ký lại thiết bị hiện tại.
       */
      const deviceRegistered = await registerCurrentDevice();

      if (deviceRegistered) {
        router.refresh();
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Không thể đăng xuất thiết bị",
      );
    } finally {
      setRevokingId(null);
    }
  }

  function openForgotPassword() {
    setForgotEmail("");
    setAuthMessage("");
    setAuthView("forgot");
  }

  function openRegister() {
    setAuthMessage("");
    setRegisterName("");
    setRegisterPhone("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    setPhoneOtp("");
    setAuthView("register");
  }

  function backToLogin() {
    setAuthMessage("");
    setAuthView("login");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#ead3b2] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#fff5df]/55 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[460px] w-[460px] rounded-full bg-[#9b6538]/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,248,233,0.45),rgba(116,71,34,0.08))]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#8b5a32]/20 bg-[#fff9ef] shadow-[0_35px_100px_rgba(75,43,20,0.25)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden min-h-[620px] flex-col justify-between bg-gradient-to-br from-[#81502b] via-[#744722] to-[#573116] p-10 text-[#fff6e7] lg:flex">
            <div>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f7dfbd] text-[#6c401f]">
                  <Building2 size={24} />
                </span>

                <div>
                  <p className="font-bold">Kim Lân Group</p>
                  
                </div>
              </div>

              <h1 className="mt-12 max-w-md text-4xl font-bold leading-tight">
                Quản lý - Vận hành các bất động sản hiệu quả hơn.
              </h1>

              <p className="mt-5 max-w-md text-sm leading-7 text-[#ead5ba]">
                Theo dõi tòa nhà, tình trạng phòng, hợp đồng,
                khách thuê và đội ngũ quản lý.
              </p>
            </div>

            <div className="space-y-4 text-sm text-[#f2ddc2]">
              <div className="flex items-center gap-3">
                <ShieldCheck size={19} />
                <span>Dữ liệu được giới hạn theo quyền quản lý</span>
              </div>

              <div className="flex items-center gap-3">
                <MonitorSmartphone size={19} />
                <span>Bảo vệ tài khoản bằng quản lý thiết bị</span>
              </div>

              <div className="flex items-center gap-3">
                <KeyRound size={19} />
                <span>Đăng nhập bằng tài khoản để bảo mật thông tin</span>
              </div>
            </div>
          </div>

          <div className="flex min-h-[560px] items-center p-5 sm:p-8 lg:min-h-[620px] lg:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 lg:hidden">
                <div className="inline-flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#744722] text-[#fff6e7]">
                    <Building2 size={23} />
                  </span>

                  <div>
                    <p className="font-bold text-[#4d301d]">
                      Kim Lân
                    </p>
                    <p className="text-xs text-[#88694e]">
                      Owner Portal
                    </p>
                  </div>
                </div>
              </div>

              {authView === "login" ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a7554]">
                      Đăng nhập hệ thống
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#432918]">
                      Chào mừng trở lại
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#7b604a]">
                      Đăng nhập tài khoản để truy cập trang quản lý chủ nhà.
                    </p>
                  </div>

                  <form
                    onSubmit={handleLogin}
                    className="mt-8 space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="owner-login-phone"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Số điện thoại
                      </label>

                      <div className="flex h-12 overflow-hidden rounded-xl border border-[#b99472]/35 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                        <span className="grid w-12 shrink-0 place-items-center border-r border-[#b99472]/20 bg-[#f5e5cf] text-[#8a6547]">
                            <Phone size={18} />
                        </span>

                        <input
                            id="owner-login-phone"
                            type="tel"
                            autoComplete="tel"
                            value={phone}
                            onChange={(event) =>
                            setPhone(event.target.value)
                            }
                            disabled={authLoading}
                            placeholder="090 123 4567"
                            className="min-w-0 flex-1 border-0 bg-transparent px-4 text-sm text-[#432918] outline-none placeholder:text-[#aa927c] disabled:opacity-60"
                            required
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="owner-login-password"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Mật khẩu
                      </label>

                      <div className="flex h-12 overflow-hidden rounded-xl border border-[#b99472]/35 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                        <span className="grid w-12 shrink-0 place-items-center border-r border-[#b99472]/20 bg-[#f5e5cf] text-[#8a6547]">
                            <KeyRound size={18} />
                        </span>

                        <input
                            id="owner-login-password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) =>
                            setPassword(event.target.value)
                            }
                            disabled={authLoading}
                            placeholder="Nhập mật khẩu"
                            className="min-w-0 flex-1 border-0 bg-transparent px-4 text-sm text-[#432918] outline-none placeholder:text-[#aa927c] disabled:opacity-60"
                            required
                        />

                        <button
                            type="button"
                            onClick={() =>
                            setShowPassword((current) => !current)
                            }
                            disabled={authLoading}
                            className="grid w-12 shrink-0 place-items-center border-l border-[#b99472]/20 text-[#8b6b50] transition hover:bg-[#f2e2cc] hover:text-[#5b371e] disabled:opacity-50"
                            aria-label={
                            showPassword
                                ? "Ẩn mật khẩu"
                                : "Hiện mật khẩu"
                            }
                        >
                            {showPassword ? (
                            <EyeOff size={18} />
                            ) : (
                            <Eye size={18} />
                            )}
                        </button>
                    </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        disabled={authLoading}
                        className="text-sm font-semibold text-[#744722] transition hover:underline disabled:opacity-50"
                      >
                        Quên mật khẩu?
                      </button>
                    </div>

                    {authMessage ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                      >
                        {authMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={!canLogin || authLoading}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-[#fff7e9] shadow-[0_12px_25px_rgba(91,54,24,0.22)] transition hover:bg-[#623817] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? (
                        <>
                          <Loader2
                            size={18}
                            className="animate-spin"
                          />
                          Đang đăng nhập...
                        </>
                      ) : (
                        "Đăng nhập Owner Portal"
                      )}
                    </button>

                    <div className="flex items-center gap-3 pt-1 text-sm text-[#8b6b50]">
                      <span className="h-px flex-1 bg-[#b99472]/25" />
                      <span>hoặc</span>
                      <span className="h-px flex-1 bg-[#b99472]/25" />
                    </div>

                    <button
                      type="button"
                      onClick={openRegister}
                      disabled={authLoading}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#744722]/30 bg-[#fffaf2] px-5 text-sm font-bold text-[#744722] transition hover:bg-[#f5e6d1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserPlus size={17} />
                      Đăng ký Owner mới
                    </button>
                  </form>
                </>
              ) : null}

              {authView === "register" ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a7554]">
                      Tạo tài khoản
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#432918]">
                      Đăng ký Owner mới
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#7b604a]">
                      Dùng số điện thoại để đăng nhập và quản lý tòa nhà của bạn.
                    </p>
                  </div>

                  <form
                    onSubmit={handleRegister}
                    className="mt-7 space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="owner-register-name"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Họ và tên
                      </label>
                      <input
                        id="owner-register-name"
                        type="text"
                        autoComplete="name"
                        value={registerName}
                        onChange={(event) => setRegisterName(event.target.value)}
                        disabled={authLoading}
                        placeholder="Nguyễn Văn A"
                        className="h-12 w-full rounded-xl border border-[#b99472]/35 bg-[#fffdf8] px-4 text-sm text-[#432918] outline-none transition placeholder:text-[#aa927c] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60"
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="owner-register-phone"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Số điện thoại
                      </label>
                      <div className="flex h-12 overflow-hidden rounded-xl border border-[#b99472]/35 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                        <span className="grid w-12 shrink-0 place-items-center border-r border-[#b99472]/20 bg-[#f5e5cf] text-[#8a6547]">
                          <Phone size={18} />
                        </span>
                        <input
                          id="owner-register-phone"
                          type="tel"
                          autoComplete="tel"
                          value={registerPhone}
                          onChange={(event) => setRegisterPhone(event.target.value)}
                          disabled={authLoading}
                          placeholder="090 123 4567"
                          className="min-w-0 flex-1 border-0 bg-transparent px-4 text-sm text-[#432918] outline-none placeholder:text-[#aa927c] disabled:opacity-60"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="owner-register-password"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Mật khẩu
                      </label>
                      <input
                        id="owner-register-password"
                        type="password"
                        autoComplete="new-password"
                        value={registerPassword}
                        onChange={(event) => setRegisterPassword(event.target.value)}
                        disabled={authLoading}
                        placeholder="Ít nhất 6 ký tự"
                        className="h-12 w-full rounded-xl border border-[#b99472]/35 bg-[#fffdf8] px-4 text-sm text-[#432918] outline-none transition placeholder:text-[#aa927c] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60"
                        required
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="owner-register-password-confirm"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Nhập lại mật khẩu
                      </label>
                      <input
                        id="owner-register-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={registerPasswordConfirm}
                        onChange={(event) =>
                          setRegisterPasswordConfirm(event.target.value)
                        }
                        disabled={authLoading}
                        placeholder="Nhập lại mật khẩu"
                        className="h-12 w-full rounded-xl border border-[#b99472]/35 bg-[#fffdf8] px-4 text-sm text-[#432918] outline-none transition placeholder:text-[#aa927c] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60"
                        required
                      />
                    </div>

                    {authMessage ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                      >
                        {authMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={!canRegister || authLoading}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-[#fff7e9] shadow-[0_12px_25px_rgba(91,54,24,0.22)] transition hover:bg-[#623817] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Đang tạo tài khoản...
                        </>
                      ) : (
                        <>
                          <UserPlus size={17} />
                          Tạo tài khoản Owner
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={backToLogin}
                      disabled={authLoading}
                      className="h-11 w-full rounded-xl border border-[#a9825f]/30 bg-[#fffaf2] text-sm font-semibold text-[#744722] transition hover:bg-[#f5e6d1] disabled:opacity-50"
                    >
                      Quay lại đăng nhập
                    </button>
                  </form>
                </>
              ) : null}

              {authView === "verify-phone" ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a7554]">
                      Xác minh số điện thoại
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#432918]">
                      Nhập mã xác minh
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#7b604a]">
                      Mã SMS đã được gửi đến{" "}
                      <strong>{registerPhone}</strong>.
                    </p>
                  </div>

                  <form
                    onSubmit={handleVerifyPhone}
                    className="mt-8 space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="owner-phone-otp"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Mã xác minh 6 số
                      </label>
                      <input
                        id="owner-phone-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={phoneOtp}
                        onChange={(event) =>
                          setPhoneOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        disabled={authLoading}
                        placeholder="123456"
                        className="h-12 w-full rounded-xl border border-[#b99472]/35 bg-[#fffdf8] px-4 text-center text-lg tracking-[0.35em] text-[#432918] outline-none transition placeholder:text-[#aa927c] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60"
                        required
                      />
                    </div>

                    {authMessage ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                      >
                        {authMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={phoneOtp.length !== 6 || authLoading}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-[#fff7e9] shadow-[0_12px_25px_rgba(91,54,24,0.22)] transition hover:bg-[#623817] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Đang xác minh...
                        </>
                      ) : (
                        "Xác minh và vào Owner Portal"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void resendPhoneOtp()}
                      disabled={authLoading}
                      className="h-11 w-full rounded-xl border border-[#a9825f]/30 bg-[#fffaf2] text-sm font-semibold text-[#744722] transition hover:bg-[#f5e6d1] disabled:opacity-50"
                    >
                      Gửi lại mã
                    </button>

                    <button
                      type="button"
                      onClick={openRegister}
                      disabled={authLoading}
                      className="w-full text-sm font-semibold text-[#744722] transition hover:underline disabled:opacity-50"
                    >
                      Đổi số điện thoại đăng ký
                    </button>
                  </form>
                </>
              ) : null}

              {authView === "forgot" ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a7554]">
                      Khôi phục tài khoản
                    </p>

                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#432918]">
                      Quên mật khẩu
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#7b604a]">
                      Hệ thống sẽ gửi đường dẫn đặt lại mật khẩu
                      đến email khôi phục của bạn.
                    </p>
                  </div>

                  <form
                    onSubmit={handleForgotPassword}
                    className="mt-8 space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="owner-forgot-email"
                        className="mb-2 block text-sm font-semibold text-[#503521]"
                      >
                        Email khôi phục
                      </label>

                      <div className="flex h-12 overflow-hidden rounded-xl border border-[#b99472]/35 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                        <span className="grid w-12 shrink-0 place-items-center border-r border-[#b99472]/20 bg-[#f5e5cf] text-[#8a6547]">
                            <Mail size={18} />
                        </span>

                        <input
                            id="owner-forgot-email"
                            type="email"
                            autoComplete="email"
                            value={forgotEmail}
                            onChange={(event) =>
                            setForgotEmail(event.target.value)
                            }
                            disabled={authLoading}
                            placeholder="owner@example.com"
                            className="min-w-0 flex-1 border-0 bg-transparent px-4 text-sm text-[#432918] outline-none placeholder:text-[#aa927c] disabled:opacity-60"
                            required
                        />
                        </div>
                    </div>

                    {authMessage ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                      >
                        {authMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={
                        authLoading ||
                        !forgotEmail.trim().includes("@")
                      }
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-5 text-sm font-bold text-[#fff7e9] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {authLoading ? (
                        <>
                          <Loader2
                            size={18}
                            className="animate-spin"
                          />
                          Đang gửi...
                        </>
                      ) : (
                        "Gửi link đặt lại mật khẩu"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={backToLogin}
                      disabled={authLoading}
                      className="h-11 w-full rounded-xl border border-[#a9825f]/30 bg-[#fffaf2] text-sm font-semibold text-[#744722] transition hover:bg-[#f5e6d1] disabled:opacity-50"
                    >
                      Quay lại đăng nhập
                    </button>
                  </form>
                </>
              ) : null}

              {authView === "sent" ? (
                <div className="text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#744722] text-[#fff7e9]">
                    <Mail size={28} />
                  </span>

                  <h2 className="mt-6 text-2xl font-bold text-[#432918]">
                    Kiểm tra email
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-[#7b604a]">
                    Đường dẫn đặt lại mật khẩu đã được gửi đến{" "}
                    <strong>{forgotEmail}</strong>.
                  </p>

                  <button
                    type="button"
                    onClick={backToLogin}
                    className="mt-7 h-11 w-full rounded-xl bg-[#744722] px-4 text-sm font-bold text-[#fff7e9]"
                  >
                    Quay lại đăng nhập
                  </button>
                </div>
              ) : null}

              {devices.length > 0 ? (
                <section className="mt-6 rounded-2xl border border-[#a9825f]/25 bg-[#f7ead7] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#744722] text-[#fff7e9]">
                      <MonitorSmartphone size={19} />
                    </span>

                    <div>
                      <h3 className="font-bold text-[#4d301d]">
                        Thiết bị đang đăng nhập
                      </h3>

                      <p className="mt-1 text-xs leading-5 text-[#80634a]">
                        Đăng xuất một thiết bị bên dưới để tiếp tục
                        đăng nhập trên thiết bị hiện tại.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {devices.map((device, index) => {
                      const sessionId = device.id;

                      return (
                        <article
                          key={sessionId || index}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#aa805b]/20 bg-[#fffaf2] p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#503521]">
                              {getDeviceLabel(device)}
                            </p>

                            <p className="mt-1 text-[11px] text-[#927258]">
                              Hoạt động gần nhất:{" "}
                              {formatLastSeen(
                                device.last_seen_at,
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={
                              !sessionId ||
                              revokingId === sessionId
                            }
                            onClick={() => {
                              if (sessionId) {
                                void revokeDevice(sessionId);
                              }
                            }}
                            className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            {revokingId === sessionId
                              ? "Đang xử lý..."
                              : "Đăng xuất"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
