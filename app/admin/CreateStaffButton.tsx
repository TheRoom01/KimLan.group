"use client";

import { useRef, useState } from "react";

export default function CreateStaffButton({ onCreated }: { onCreated?: () => void } = {}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [date, setDate] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), full_name: fields.get("full_name"), phone: fields.get("phone"), password: fields.get("password"), level: Number(fields.get("level")), existing }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không cấp được tài khoản.");
      const issued = new Date(result.account.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      setSuccess(`Đã cấp quyền L${result.account.level} cho ${result.account.email}. Ngày cấp: ${issued}.`);
      form.reset(); setExisting(false);
      onCreated?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  const input = "mt-1 w-full rounded-lg border border-[#d9c7b5] bg-white px-3 py-2 text-sm text-[#332519]";
  return <>
    <button type="button" className="rounded-lg bg-[#704522] px-3 py-2 text-sm font-semibold text-white hover:bg-[#58351a]" onClick={() => { setError(""); setSuccess(""); setDate(new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })); dialog.current?.showModal(); }}>Tạo tài khoản NV</button>
    <dialog ref={dialog} aria-labelledby="staff-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-[#fffaf3] p-6 text-[#332519] shadow-xl backdrop:bg-black/40" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="staff-title" className="text-lg font-bold">Tạo / Cấp tài khoản NV</h2><button type="button" disabled={busy} aria-label="Đóng" onClick={() => dialog.current?.close()} className="rounded-lg px-3 py-2 hover:bg-black/5">✕</button></div>
      <form onSubmit={submit} className="staff-account-form space-y-4">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={existing} onChange={event => setExisting(event.target.checked)} />Cấp quyền cho tài khoản đã có email đăng nhập</label>
          <label className="block text-sm font-medium">Họ và tên<input name="full_name" placeholder="Nhập họ và tên nhân viên" required maxLength={150} autoComplete="name" className={input} /></label>
          <label className="block text-sm font-medium">Email đăng nhập<input name="email" placeholder="Ví dụ: nhanvien@email.com" type="email" required maxLength={254} autoComplete="off" className={input} /></label>
          <label className="block text-sm font-medium">Số điện thoại<input name="phone" placeholder="Ví dụ: 0901234567" type="tel" required minLength={8} maxLength={25} autoComplete="tel" className={input} /></label>
          <label className="block text-sm font-medium">Cấp phân quyền<select name="level" defaultValue="2" className={input}><option value="1">L1 — Quản trị cấp 1</option><option value="2">L2 — Quản trị cấp 2</option></select></label>
          {!existing && <label className="block text-sm font-medium">Mật khẩu đăng nhập<input name="password" placeholder="Nhập mật khẩu tối thiểu 8 ký tự" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={input} /><span className="mt-1 block text-xs font-normal text-stone-600">Tối thiểu 8 ký tự. Nhân viên có thể đổi mật khẩu sau khi đăng nhập.</span></label>}
          <label className="block text-sm font-medium">Ngày cấp tài khoản<input readOnly value={date} className={`${input} bg-stone-100`} /><span className="mt-1 block text-xs font-normal text-stone-600">Tự ghi theo thời điểm cấp thành công (giờ Việt Nam).</span></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-green-800">{success}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => dialog.current?.close()} className="rounded-lg border px-4 py-2 text-sm">Đóng</button><button type="submit" disabled={busy} className="rounded-lg bg-[#704522] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Đang cấp tài khoản…" : existing ? "Cấp quyền Admin" : "Tạo tài khoản"}</button></div>
      </form>
    </dialog>
  </>;
}
