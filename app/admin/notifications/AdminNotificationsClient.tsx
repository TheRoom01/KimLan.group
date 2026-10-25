"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Check, CheckCheck, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api/client";
import { repairNotificationText } from "@/lib/notifications/repairMojibake";

type Notification = {
  id: string; type: string; title: string; message: string | null;
  reference_id: string | null; reference_type: string | null; is_read: boolean; created_at: string;
};
type Payload = { notifications: Notification[]; unread_count: number; total: number; page: number; page_size: number };
const PAGE_SIZE = 30;

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    property_access_granted: "Đã cấp quyền tòa nhà",
    property_join_request: "Yêu cầu tham gia tòa nhà",
    property_owner_verification: "Xác minh quyền tòa nhà",
    room_consult_request: "Yêu cầu tư vấn / xem phòng",
    booking_deposit: "Thông báo đặt cọc",
    booking_deadline: "Nhắc hạn đặt cọc",
  };
  return labels[type] ?? repairNotificationText(type.replaceAll("_", " "));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function notificationHref(item: Notification) {
  if (item.reference_type === "room_consult_request" && item.reference_id) {
    return `/admin/room-inquiries?request=${encodeURIComponent(item.reference_id)}`;
  }
  return null;
}

export default function AdminNotificationsClient() {
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await readApiResponse<Payload>(await fetch(`/api/admin/notifications?page=${page}`, { cache: "no-store" })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được thông báo.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, [page]);

  useEffect(() => () => clearLongPress(), []);

  async function markRead(id?: string) {
    setUpdating(true);
    setError("");
    setSuccess("");
    try {
      await readApiResponse(await fetch("/api/admin/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { mark_all_read: true }),
      }));
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không cập nhật được thông báo.");
    } finally {
      setUpdating(false);
    }
  }

  async function markSelectedRead() {
    if (!selectedIds.length) return;
    setUpdating(true);
    setError("");
    setSuccess("");
    try {
      await readApiResponse(await fetch("/api/admin/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      }));
      setSelectionMode(false);
      setSelectedIds([]);
      await load();
      setSuccess("Đã đánh dấu các thông báo đã chọn là đã đọc.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không cập nhật được thông báo.");
    } finally {
      setUpdating(false);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || !window.confirm(`Xóa ${selectedIds.length} thông báo đã chọn?`)) return;
    setUpdating(true);
    setError("");
    setSuccess("");
    try {
      const result = await readApiResponse<{ deleted_ids: string[] }>(await fetch("/api/admin/notifications", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      }));
      setSelectionMode(false);
      setSelectedIds([]);
      await load();
      setSuccess(`Đã xóa ${result.deleted_ids.length} thông báo.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không xóa được thông báo đã chọn.");
    } finally {
      setUpdating(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectionMode(true);
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function startLongPress(id: string, pointerType: string, button: number) {
    if (selectionMode || (pointerType === "mouse" && button !== 0)) return;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      suppressClick.current = true;
      setSelectionMode(true);
      setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    }, 1_000);
  }

  const totalPages = Math.max(1, Math.ceil((payload?.total ?? 0) / PAGE_SIZE));

  return <main className="min-h-[70vh] p-1 text-[#432d1e] sm:p-3">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#d9c4a9] pb-4">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-semibold text-[#806348] hover:text-[#4d3422]"><ArrowLeft size={14} /> Quay lại Admin</Link>
        <h1 className="mt-2 text-xl font-black sm:text-2xl">Thông báo Admin</h1>
        <p className="mt-1 text-sm text-[#806348]">Thông báo gắn với tài khoản đang đăng nhập.</p>
      </div>
      <div className="flex items-center gap-2">
        {(payload?.unread_count ?? 0) > 0 ? <button type="button" disabled={updating} onClick={() => void markRead()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dac9b6] bg-white px-3 text-sm font-semibold text-[#684324] disabled:opacity-50"><CheckCheck size={15} /> Đánh dấu tất cả đã đọc</button> : null}
        <button type="button" aria-label="Làm mới thông báo" disabled={loading} onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dac9b6] bg-white text-[#684324] hover:bg-[#fff8ed] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>
    </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {success ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p> : null}
    {loading ? <div className="flex items-center justify-center gap-2 py-14 text-sm text-[#806348]"><LoaderCircle size={17} className="animate-spin" /> Đang tải thông báo…</div>
      : !payload?.notifications.length ? <div className="py-14 text-center text-sm text-[#806348]"><Bell className="mx-auto mb-2 text-[#b39475]" size={25} />Chưa có thông báo.</div>
        : <div className="mt-4 grid gap-3">{payload.notifications.map((item) => {
          const href = notificationHref(item);
          const selected = selectedIds.includes(item.id);
          const content = <><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#744722] text-white" : item.is_read ? "bg-[#eadbc8] text-[#80634a]" : "bg-[#744722] text-white"}`}>{selected ? <Check size={17} /> : <Bell size={17} />}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 font-bold text-[#4d3422]">{repairNotificationText(item.title)}<span className="rounded-full bg-[#f5ead9] px-2 py-0.5 text-[10px] font-semibold text-[#705035]">{typeLabel(item.type)}</span></span>{item.message ? <span className="mt-1 block text-sm leading-5 text-[#806348]">{repairNotificationText(item.message)}</span> : null}<time dateTime={item.created_at} className="mt-1 block text-xs text-[#9a7758]">{dateLabel(item.created_at)} · {item.is_read ? "Đã đọc" : "Chưa đọc"}</time></span></>;
          return <article key={item.id}
            onPointerDown={(event) => startLongPress(item.id, event.pointerType, event.button)}
            onPointerUp={clearLongPress} onPointerCancel={clearLongPress} onPointerLeave={clearLongPress}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              if (selectionMode) {
                event.preventDefault();
                event.stopPropagation();
                toggleSelected(item.id);
              }
            }}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm transition ${selected ? "border-[#8b6b4d] bg-[#f2e3cc] ring-2 ring-[#c9a46a]/30" : `border-[#ddcbb7] ${item.is_read ? "bg-white" : "bg-[#fff7e9]"}`} ${selectionMode ? "cursor-pointer select-none" : ""}`}>
            {href ? <Link href={href} onClick={() => { if (!selectionMode && !item.is_read) void markRead(item.id); }} className="flex min-w-0 flex-1 items-start gap-3">{content}</Link> : <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>}
            {selectionMode ? <button type="button" aria-label={selected ? "Bỏ chọn thông báo" : "Chọn thông báo"} aria-pressed={selected} disabled={updating} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${selected ? "border-[#744722] bg-[#744722] text-white" : "border-[#bca88e] bg-white text-transparent"}`}><Check size={15} /></button> : !item.is_read ? <button type="button" disabled={updating} onClick={() => void markRead(item.id)} className="min-h-10 rounded-xl border border-[#dac9b6] bg-white px-3 text-xs font-semibold text-[#684324] disabled:opacity-50">Đánh dấu đã đọc</button> : null}
          </article>;
        })}</div>}
    {!loading && (payload?.total ?? 0) > 0 ? <div className="mt-5 border-t border-[#d9c4a9] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#806348]">{selectionMode ? `${selectedIds.length} thông báo đã chọn` : "Nhấn giữ thông báo 1 giây hoặc chọn nút bên phải để thao tác nhiều mục."}</p>
        <button type="button" disabled={updating} onClick={() => { setSelectionMode((current) => !current); setSelectedIds([]); }} className="min-h-10 rounded-xl border border-[#dac9b6] bg-white px-3 text-sm font-semibold text-[#684324] disabled:opacity-50">{selectionMode ? <><X size={14} className="mr-1 inline" /> Bỏ chọn</> : "Chọn thông báo"}</button>
      </div>
      {selectionMode && selectedIds.length > 0 ? <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={updating || !selectedIds.some((id) => payload?.notifications.some((item) => item.id === id && !item.is_read))} onClick={() => void markSelectedRead()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dac9b6] bg-white px-3 text-sm font-semibold text-[#684324] disabled:opacity-50"><CheckCheck size={15} /> Đánh dấu đã đọc</button>
        <button type="button" disabled={updating} onClick={() => void deleteSelected()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"><Trash2 size={15} /> Xóa đã chọn ({selectedIds.length})</button>
      </div> : null}
    </div> : null}
    {!loading && (payload?.total ?? 0) > 0 ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9c4a9] pt-4 text-sm text-[#806348]">
      <span>{payload?.total.toLocaleString("vi-VN")} thông báo · {payload?.unread_count} chưa đọc · Trang {page} / {totalPages}</span>
      <div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#dac9b6] bg-white px-3 font-semibold text-[#684324] disabled:opacity-45"><ChevronLeft size={15} /> Trước</button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#dac9b6] bg-white px-3 font-semibold text-[#684324] disabled:opacity-45">Tiếp <ChevronRight size={15} /></button></div>
    </div> : null}
  </main>;
}
