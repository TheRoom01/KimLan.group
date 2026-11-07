"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CreateStaffButton from "./CreateStaffButton";
import { PanelLoadingSkeleton } from "@/components/ui/LoadingSkeleton";

type Staff = { user_id: string; full_name: string | null; email: string | null; phone: string | null; level: number; created_at: string | null };
export default function StaffAccountsButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [accounts, setAccounts] = useState<Staff[]>([]);
  const [myId, setMyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<{ account: Staff; kind: "delete" | "role" } | null>(null);
  const [newLevel, setNewLevel] = useState(2);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/staff", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không tải được tài khoản NV.");
      setAccounts(result.accounts); setMyId(result.current_user_id);
    } catch (err) { setError(err instanceof Error ? err.message : "Không kết nối được máy chủ."); }
    finally { setLoading(false); }
  }
  async function apply() {
    if (!action || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/staff", { method: action.kind === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: action.account.user_id, level: newLevel, expected_level: action.account.level }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không cập nhật được tài khoản.");
      setSuccess(action.kind === "delete" ? "Đã xóa tài khoản NV khỏi danh sách quản trị." : `Đã đổi quyền thành L${newLevel}.`);
      setAction(null); await load(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10 sm:text-sm" onClick={() => { setAction(null); setSuccess(""); dialog.current?.showModal(); void load(); }}>Tài khoản NV</button>
    <dialog ref={dialog} aria-labelledby="staff-list-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto rounded-2xl bg-[#fffaf3] p-4 text-[#332519] shadow-xl backdrop:bg-black/40 sm:p-6" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="staff-list-title" className="text-lg font-bold">Tài khoản NV</h2><p className="mt-1 text-sm text-stone-600">Danh sách tài khoản đang có quyền Admin L1/L2.</p></div>
        <div className="flex flex-wrap gap-2"><CreateStaffButton onCreated={() => { void load(); }} /><button type="button" disabled={busy || loading} className="rounded-lg border border-[#b99a7b] px-3 py-2 text-sm disabled:opacity-50" onClick={() => { void load(); }}>Tải lại</button><button type="button" aria-label="Đóng danh sách tài khoản" disabled={busy} className="rounded-lg px-3 py-2 hover:bg-black/5" onClick={() => dialog.current?.close()}>✕</button></div>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}
      {action && <section aria-label={action.kind === "delete" ? "Xác nhận xóa tài khoản" : "Thay đổi quyền tài khoản"} className="staff-account-form mb-4 rounded-xl border border-[#b99a7b] bg-white p-4">
        <h3 className="font-semibold">{action.kind === "delete" ? "Xóa tài khoản NV" : "Thay đổi quyền"}: {action.account.full_name || action.account.email || action.account.user_id}</h3>
        {action.kind === "delete" ? <p className="mt-2 text-sm">Tài khoản sẽ mất quyền Admin ngay sau khi xóa. Email đăng nhập và dữ liệu phòng vẫn được giữ lại.</p> : <div className="mt-3 text-sm"><label htmlFor="staff-new-level">Quyền mới</label><select id="staff-new-level" value={newLevel} disabled={busy} onChange={event => setNewLevel(Number(event.target.value))}><option value={1}>L1 — Quản trị cấp 1</option><option value={2}>L2 — Quản trị cấp 2</option></select></div>}
        <div className="mt-3 flex gap-2"><button type="button" disabled={busy || (action.kind === "role" && newLevel === action.account.level)} onClick={() => { void apply(); }} className="rounded-lg bg-[#704522] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Đang lưu…" : action.kind === "delete" ? "Xác nhận xóa tài khoản" : "Lưu quyền"}</button><button type="button" disabled={busy} onClick={() => setAction(null)} className="rounded-lg border px-4 py-2 text-sm">Hủy</button></div>
      </section>}
      {loading ? <PanelLoadingSkeleton /> : <div className="overflow-x-auto rounded-xl border border-[#d9c7b5] bg-white"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-[#eee3d5]"><tr>{["Họ và tên", "Email đăng nhập", "Số điện thoại", "Quyền", "Ngày cấp", "Thao tác"].map(title => <th key={title} scope="col" className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead>
        <tbody>{accounts.map(account => <tr key={account.user_id} className="border-t border-[#eee3d5]">
          <td className="px-3 py-3">{account.full_name || "—"}{account.user_id === myId && <span className="ml-2 text-xs text-stone-500">(Bạn)</span>}</td><td className="break-all px-3 py-3">{account.email || "—"}</td><td className="whitespace-nowrap px-3 py-3">{account.phone || "—"}</td><td className="px-3 py-3"><span className="rounded-md bg-[#eee3d5] px-2 py-1 font-semibold">L{account.level}</span></td><td className="whitespace-nowrap px-3 py-3">{account.created_at ? new Date(account.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—"}</td>
          <td className="px-3 py-3"><div className="flex whitespace-nowrap"><button type="button" disabled={busy || account.user_id === myId} title={account.user_id === myId ? "Không tự xóa tài khoản đang sử dụng" : undefined} className="rounded px-2 py-1 text-red-700 hover:bg-red-50 disabled:opacity-40" onClick={() => { setAction({ account, kind: "delete" }); setError(""); setSuccess(""); }}>Xóa Tài khoản</button><span className="px-1 py-1 text-stone-400">|</span><button type="button" disabled={busy || account.user_id === myId} title={account.user_id === myId ? "Không tự đổi quyền tài khoản đang sử dụng" : undefined} className="rounded px-2 py-1 text-[#704522] hover:bg-stone-100 disabled:opacity-40" onClick={() => { setAction({ account, kind: "role" }); setNewLevel(account.level); setError(""); setSuccess(""); }}>Thay đổi quyền</button></div></td>
        </tr>)}{accounts.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-stone-500">Chưa có tài khoản NV.</td></tr>}</tbody>
      </table></div>}
    </dialog>
  </>;
}
