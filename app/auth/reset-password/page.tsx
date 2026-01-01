"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  const handleReset = async () => {
    setMsg("");

    if (password.length < 8) {
      setMsg("Mật khẩu tối thiểu 8 ký tự");
      return;
    }
    if (password !== password2) {
      setMsg("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: password,
    });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {!done ? (
          <>
            <h2 className="mb-4 text-lg font-semibold">Đặt lại mật khẩu</h2>

            <input
              type="password"
              placeholder="Mật khẩu mới"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            />

            <input
              type="password"
              placeholder="Xác nhận mật khẩu mới"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            />

            {!!msg && (
              <div className="mb-3 text-sm text-red-600">{msg}</div>
            )}

            <button
              onClick={handleReset}
              disabled={loading}
              className="w-full rounded-lg bg-black py-2 text-white disabled:opacity-50"
            >
              {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-2 text-lg font-semibold">Thành công</h2>
            <p className="mb-4 text-sm text-gray-600">
              Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại.
            </p>

            <a
              href="/"
              className="block w-full rounded-lg bg-black py-2 text-center text-white"
            >
              Về trang chủ
            </a>
          </>
        )}
      </div>
    </div>
  );
}
