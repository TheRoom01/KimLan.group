"use client";

import { Bell, Building2, FileText, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { readApiResponse } from "@/lib/api/client";
import { PanelLoadingSkeleton } from "@/components/ui/LoadingSkeleton";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  is_read: boolean;
  created_at: string;
  metadata?: {
    has_owner?: boolean;
    pending_role?: "owner" | "manager" | null;
    match_source?: "property" | "room" | null;
  } | null;
};

type AccessRequestResult = {
  mode?: "access_granted" | "request_pending" | "already_member";
  property_id?: string;
  role?: "owner" | "manager";
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
  const [accessSuggestion, setAccessSuggestion] = useState<NotificationItem | null>(null);
  const [requestingRole, setRequestingRole] = useState<"owner" | "manager" | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

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
    if (item.reference_type === "property_phone_suggestion") {
      setOpen(false);
      setAccessError(null);
      setAccessSuggestion(item);
      return;
    }

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

  async function requestPropertyAccess(role: "owner" | "manager") {
    const propertyId = accessSuggestion?.reference_id;
    if (!propertyId) return;
    setRequestingRole(role);
    setAccessError(null);
    try {
      const result = await readApiResponse<AccessRequestResult>(await fetch("/api/owner/property-access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId, role }),
      }));
      setNotifications((current) => current.filter((item) => item.id !== accessSuggestion.id));
      setUnreadCount((current) => Math.max(0, current - 1));
      setAccessSuggestion(null);
      router.refresh();
      if (result.mode === "access_granted" || result.mode === "already_member") {
        router.push(`/owner/properties/${propertyId}`);
      } else {
        window.alert("Đã gửi yêu cầu. Chủ tòa nhà hiện tại sẽ nhận được thông báo để phê duyệt.");
      }
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Không thể gửi yêu cầu nhận quyền");
    } finally {
      setRequestingRole(null);
    }
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
            {loading ? <PanelLoadingSkeleton /> : <>
              {notifications.length === 0 ? <div className="p-6 text-center"><Bell className="mx-auto text-[#b39475]" size={26} /><p className="mt-2 text-sm font-semibold text-[#684324]">Bạn chưa có thông báo mới</p></div> : notifications.map((item) => <NotificationRow key={item.id} item={item} onOpen={openNotification} onDelete={deleteNotification} />)}
            </>}
          </div>
        </section>
      ) : null}

      {accessSuggestion ? (
        <div className="fixed inset-0 z-[400] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={() => { if (!requestingRole) setAccessSuggestion(null); }}>
          <section className="w-full max-w-md rounded-3xl border border-white/35 bg-[#fff9ef] p-5 text-[#432918] shadow-2xl" onMouseDown={(event) => event.stopPropagation()} aria-label="Xác nhận quyền tòa nhà">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#744722] text-white"><KeyRound size={20} /></span>
                <h2 className="mt-4 text-lg font-black">Nhận quyền tòa nhà</h2>
                <p className="mt-2 text-sm leading-6 text-[#80634a]">Số điện thoại đã xác minh của bạn trùng với thông tin Zalo tại:</p>
                <p className="mt-1 font-bold text-[#4d3422]">{accessSuggestion.message}</p>
              </div>
              <button type="button" aria-label="Đóng" disabled={Boolean(requestingRole)} onClick={() => setAccessSuggestion(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-[#f3e1c9] disabled:opacity-50"><X size={18} /></button>
            </div>

            {accessSuggestion.metadata?.has_owner ? (
              <p className="mt-4 rounded-xl border border-[#d8bd99] bg-[#f8ead7] p-3 text-xs leading-5 text-[#74583e]">Tòa nhà đã có chủ. Yêu cầu của bạn sẽ được gửi đến chủ hiện tại để xác nhận.</p>
            ) : (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">Tòa nhà chưa có chủ sở hữu. Quyền bạn chọn sẽ được kích hoạt sau khi xác minh số điện thoại.</p>
            )}

            {accessError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{accessError}</p> : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={Boolean(requestingRole)} onClick={() => void requestPropertyAccess("manager")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/30 bg-white px-3 text-sm font-bold text-[#684324] hover:bg-[#f3e1c9] disabled:opacity-50">
                {requestingRole === "manager" ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />} Quản lý
              </button>
              <button type="button" disabled={Boolean(requestingRole)} onClick={() => void requestPropertyAccess("owner")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#744722] px-3 text-sm font-bold text-white hover:bg-[#623817] disabled:opacity-50">
                {requestingRole === "owner" ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Chủ nhà
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({ item, onOpen, onDelete }: { item: NotificationItem; onOpen: (item: NotificationItem) => Promise<void>; onDelete: (item: NotificationItem) => Promise<void> }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);
  const Icon = item.reference_type === "property_phone_suggestion"
    ? KeyRound
    : item.reference_type === "property_join_request"
      ? Building2
      : FileText;

  return <div className="relative overflow-hidden border-b border-[#aa825d]/15 bg-red-700 text-white">
    <div className="absolute inset-y-0 left-0 flex w-24 items-center justify-center gap-1 text-xs font-bold"><Trash2 size={16} /> Xóa</div>
    <button type="button" onClick={() => { if (!dragged.current) void onOpen(item); dragged.current = false; }} onPointerDown={(event) => { startX.current = event.clientX; dragged.current = false; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (startX.current === null) return; const next = Math.max(0, Math.min(120, event.clientX - startX.current)); if (next > 5) dragged.current = true; setOffset(next); }} onPointerUp={() => { const shouldDelete = offset >= 85; startX.current = null; setOffset(0); if (shouldDelete) void onDelete(item); }} onPointerCancel={() => { startX.current = null; setOffset(0); }} style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }} className={`flex w-full items-start gap-3 p-4 text-left transition-colors ${item.is_read ? "bg-[#fff9ef]" : "bg-[#f8ead7]"}`}>
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.is_read ? "bg-[#eadbc8] text-[#80634a]" : "bg-[#744722] text-white"}`}><Icon size={17} /></span>
      <span className="min-w-0 flex-1"><span className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-bold text-[#4d3422]">{repairVietnameseMojibake(item.title)}</span>{!item.is_read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" /> : null}</span>{item.message ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#80634a]">{repairVietnameseMojibake(item.message)}</span> : null}<span className="mt-1.5 block text-[11px] font-medium text-[#9a7758]">{relativeTime(item.created_at)}</span></span>
    </button>
  </div>;
}

function repairVietnameseMojibake(value: string) {
  if (!/[ÃÄ]|á[\u0080-\u00bf]/.test(value)) return value;
  const codePoints = Array.from(value, (character) => character.charCodeAt(0));
  if (codePoints.some((codePoint) => codePoint > 255)) return value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(codePoints));
  } catch {
    return value;
  }
}

function notificationHref(item: NotificationItem) {
  if (item.reference_type === "property_join_request" && item.reference_id) {
    return `/owner/properties?request=${encodeURIComponent(item.reference_id)}`;
  }
  if (item.reference_type === "property" && item.reference_id) {
    return `/owner/properties/${encodeURIComponent(item.reference_id)}`;
  }
  if (item.reference_type === "booking_deposit" && item.reference_id) {
    return `/owner/contracts/${encodeURIComponent(item.reference_id)}`;
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
