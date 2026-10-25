"use client";

import { Bell, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api/client";
import { repairNotificationText } from "@/lib/notifications/repairMojibake";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
};

type NotificationPayload = { notifications: NotificationItem[]; unread_count: number };

function notificationTypeLabel(type: string) {
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

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.round((time - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export default function AdminNotificationCenter() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [updating, setUpdating] = useState(false);

  const loadNotifications = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      const result = await readApiResponse<NotificationPayload>(response);
      setNotifications(result.notifications ?? []);
      setUnreadCount(result.unread_count ?? 0);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được thông báo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(true), 45_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [open]);

  async function markRead(id?: string) {
    setUpdating(true);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { mark_all_read: true }),
      });
      await readApiResponse(response);
      if (id) {
        setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      } else {
        setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
        setUnreadCount(0);
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không cập nhật được thông báo.");
    } finally {
      setUpdating(false);
    }
  }

  async function openNotification(item: NotificationItem) {
    if (!item.is_read) await markRead(item.id);
    setOpen(false);
    if (item.reference_type === "room_consult_request" && item.reference_id) {
      router.push(`/admin/room-inquiries?request=${encodeURIComponent(item.reference_id)}`);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => { setOpen((value) => !value); if (!open) void loadNotifications(); }}
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`} aria-expanded={open}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c9a46a]/45 bg-[#fffaf2] text-[#684324] shadow-sm transition hover:bg-[#f6ead7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a46a]">
        <Bell size={18} />
        {unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? <section aria-label="Thông báo Admin" className="fixed inset-x-3 top-[68px] z-[300] overflow-hidden rounded-2xl border border-[#c9a46a]/40 bg-[#fffaf2] text-[#432918] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]">
        <div className="flex items-center justify-between gap-3 border-b border-[#c9a46a]/20 px-4 py-3.5">
          <div><h2 className="font-bold">Thông báo</h2><p className="mt-0.5 text-xs text-[#80634a]">{unreadCount} chưa đọc</p></div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void loadNotifications()} disabled={loading} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#744722] hover:underline disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Làm mới</button>
            {unreadCount > 0 ? <button type="button" onClick={() => void markRead()} disabled={updating} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#744722] hover:underline disabled:opacity-50"><CheckCheck size={14} /> Đọc tất cả</button> : null}
          </div>
        </div>
        {error ? <p role="alert" className="mx-3 mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-800">{error}</p> : null}
        <div className="max-h-[min(65vh,520px)] overflow-y-auto overscroll-contain">
          {loading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-[#80634a]"><LoaderCircle size={17} className="animate-spin" /> Đang tải thông báo…</div>
            : notifications.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto text-[#b39475]" size={25} /><p className="mt-2 text-sm font-semibold text-[#684324]">Chưa có thông báo</p></div>
              : notifications.map((item) => <article key={item.id} className={`border-b border-[#aa825d]/15 p-3.5 ${item.is_read ? "bg-[#fffaf2]" : "bg-[#f7ead7]"}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.is_read ? "bg-[#eadbc8] text-[#80634a]" : "bg-[#744722] text-white"}`}><Bell size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => void openNotification(item)} className="block min-h-8 w-full text-left text-sm font-bold text-[#4d3422] hover:underline">{repairNotificationText(item.title)}</button>
                    {item.message ? <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#80634a]">{repairNotificationText(item.message)}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[#9a7758]"><span>{notificationTypeLabel(item.type)}</span><span>·</span><time dateTime={item.created_at} title={new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(item.created_at))}>{relativeTime(item.created_at)}</time><span>·</span><span>{item.is_read ? "Đã đọc" : "Chưa đọc"}</span></div>
                    {item.reference_type === "room_consult_request" && item.reference_id ? <button type="button" onClick={() => void openNotification(item)} className="mt-2 min-h-8 text-xs font-bold text-[#744722] underline">Mở yêu cầu</button> : null}
                  </div>
                  {!item.is_read ? <button type="button" aria-label="Đánh dấu đã đọc" disabled={updating} onClick={() => void markRead(item.id)} className="min-h-9 min-w-9 rounded-lg text-xs font-semibold text-[#744722] hover:bg-white/70 disabled:opacity-50">Đọc</button> : null}
                </div>
              </article>)}
        </div>
        <a href="/admin/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center border-b border-[#c9a46a]/20 bg-[#fffaf2] text-sm font-bold text-[#684324] hover:bg-[#f7ead7]">Xem tất cả thông báo</a>
        <a href="/admin/room-inquiries" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center bg-[#f7ead7] text-sm font-bold text-[#684324] hover:bg-[#f0dec4]">Quản lý yêu cầu phòng</a>
      </section> : null}
    </div>
  );
}
