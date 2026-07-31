"use client";

import { Bell, Building2, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { readApiResponse } from "@/lib/api/client";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  is_read: boolean;
  created_at: string;
};

type NotificationResult = {
  notifications: NotificationItem[];
  unread_count: number;
};

export default function OwnerNotificationCenter() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/owner/notifications", { cache: "no-store" });
      const result = await readApiResponse<NotificationResult>(response);
      setNotifications(result.notifications ?? []);
      setUnreadCount(result.unread_count ?? 0);
    } catch (error) {
      console.error("[OwnerNotificationCenter]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  async function openNotification(item: NotificationItem) {
    if (!item.is_read) {
      try {
        await readApiResponse(await fetch(`/api/owner/notifications/${item.id}`, { method: "PATCH" }));
        setNotifications((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, is_read: true } : candidate));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch (error) {
        console.error("[OwnerNotificationCenter:mark-read]", error);
      }
    }

    setOpen(false);
    const destination = notificationHref(item);
    if (destination) router.push(destination);
  }

  async function deleteNotification(item: NotificationItem) {
    await readApiResponse(await fetch(`/api/owner/notifications/${item.id}`, { method: "DELETE" }));
    setNotifications((current) => current.filter((candidate) => candidate.id !== item.id));
    if (!item.is_read) setUnreadCount((current) => Math.max(0, current - 1));
  }

  async function deleteAllNotifications() {
    if (notifications.length === 0 || !window.confirm("Xóa tất cả thông báo?")) return;
    await readApiResponse(await fetch("/api/owner/notifications", { method: "DELETE" }));
    setNotifications([]);
    setUnreadCount(0);
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => { setOpen((current) => !current); if (!open) void loadNotifications(); }} aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ""}`} className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#f3d9b4]/20 bg-white/5 transition hover:bg-white/10">
        <Bell size={18} />
        {unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#704522] bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <section className="fixed inset-x-3 top-[68px] z-[250] overflow-hidden rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] text-[#432918] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]" aria-label="Trung tâm thông báo">
          <div className="flex items-center justify-between border-b border-[#aa825d]/20 px-4 py-3.5">
            <div><h2 className="font-bold">Thông báo</h2><p className="mt-0.5 text-xs text-[#80634a]">{unreadCount} thông báo chưa đọc</p></div>
            <div className="flex items-center gap-3"><button type="button" onClick={() => void loadNotifications()} className="text-xs font-semibold text-[#744722] hover:underline">Làm mới</button>{notifications.length ? <button type="button" onClick={() => void deleteAllNotifications()} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"><Trash2 size={13} /> Xóa tất cả</button> : null}</div>
          </div>

          <div className="max-h-[min(65vh,520px)] overflow-y-auto overscroll-contain [scrollbar-color:#b58f69_transparent] [scrollbar-width:thin]">
            {loading ? <p className="p-6 text-center text-sm text-[#80634a]">Đang tải thông báo...</p> : <>
              {notifications.length === 0 ? <div className="p-6 text-center"><Bell className="mx-auto text-[#b39475]" size={26} /><p className="mt-2 text-sm font-semibold text-[#684324]">Bạn chưa có thông báo mới</p></div> : notifications.map((item) => <NotificationRow key={item.id} item={item} onOpen={openNotification} onDelete={deleteNotification} />)}
            </>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function NotificationRow({ item, onOpen, onDelete }: { item: NotificationItem; onOpen: (item: NotificationItem) => Promise<void>; onDelete: (item: NotificationItem) => Promise<void> }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);
  const Icon = item.reference_type === "property_join_request" ? Building2 : FileText;

  return <div className="relative overflow-hidden border-b border-[#aa825d]/15 bg-red-700 text-white">
    <div className="absolute inset-y-0 left-0 flex w-24 items-center justify-center gap-1 text-xs font-bold"><Trash2 size={16} /> Xóa</div>
    <button type="button" onClick={() => { if (!dragged.current) void onOpen(item); dragged.current = false; }} onPointerDown={(event) => { startX.current = event.clientX; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (startX.current === null) return; const next = Math.max(0, Math.min(120, event.clientX - startX.current)); if (next > 5) dragged.current = true; setOffset(next); }} onPointerUp={() => { const shouldDelete = offset >= 85; startX.current = null; setOffset(0); if (shouldDelete) void onDelete(item); }} onPointerCancel={() => { startX.current = null; setOffset(0); }} style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }} className={`flex w-full items-start gap-3 p-4 text-left transition-colors ${item.is_read ? "bg-[#fff9ef]" : "bg-[#f8ead7]"}`}>
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.is_read ? "bg-[#eadbc8] text-[#80634a]" : "bg-[#744722] text-white"}`}><Icon size={17} /></span>
      <span className="min-w-0 flex-1"><span className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-bold text-[#4d3422]">{item.title}</span>{!item.is_read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}</span>{item.message ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#80634a]">{item.message}</span> : null}<span className="mt-1.5 block text-[11px] font-medium text-[#9a7758]">{relativeTime(item.created_at)}</span></span>
    </button>
  </div>;
}

function notificationHref(item: NotificationItem) {
  if (item.reference_type === "property_join_request" && item.reference_id) {
    return `/owner/properties?request=${encodeURIComponent(item.reference_id)}`;
  }
  if (item.reference_type === "property_phone_suggestion" && item.reference_id) {
    return `/owner/properties/create?property_id=${encodeURIComponent(item.reference_id)}`;
  }
  return null;
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}
