"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { readApiResponse } from "@/lib/api/client";

type Status = "new" | "contacted" | "scheduled" | "completed" | "cancelled";
type RoomRequest = {
  id: string;
  room_id: string | null;
  room_code_snapshot: string;
  room_type_snapshot: string | null;
  address_snapshot: string | null;
  price_snapshot: number | null;
  guest_name: string;
  guest_phone: string;
  request_type: "consultation" | "viewing";
  viewing_date: string | null;
  preferred_time: string | null;
  notes: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
};
type RequestTypeFilter = "all" | "consultation" | "viewing";

const STATUS_LABEL: Record<Status, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  scheduled: "Đã lên lịch",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
const SELECT_CLASS = "min-h-10 rounded-xl border border-[#dac9b6] bg-white px-3 text-sm font-semibold text-[#4b3322] outline-none focus:ring-2 focus:ring-[#c9a46a]/35";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

export default function RoomConsultRequestsClient({
  backHref,
  focusRequestId,
}: {
  backHref: string;
  focusRequestId?: string;
}) {
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>(focusRequestId ? "all" : "new");
  const [typeFilter, setTypeFilter] = useState<RequestTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ status: statusFilter, request_type: typeFilter, page: String(page) });
      if (focusRequestId) query.set("request_id", focusRequestId);
      const result = await readApiResponse<{ requests: RoomRequest[]; total: number }>(await fetch(`/api/admin/room-consult-requests?${query}`, { cache: "no-store" }));
      setRequests(result.requests ?? []);
      setTotal(result.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được yêu cầu.");
    } finally {
      setLoading(false);
    }
  }, [focusRequestId, page, statusFilter, typeFilter]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  async function updateStatus(id: string, status: Status) {
    setUpdatingId(id);
    setError("");
    setSuccess("");
    try {
      await readApiResponse(await fetch("/api/admin/room-consult-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      }));
      await loadRequests();
      setSuccess("Đã cập nhật trạng thái yêu cầu.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không cập nhật được trạng thái.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function copyPhone(id: string, phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1500);
    } catch {
      setError("Không thể sao chép số điện thoại trên trình duyệt này.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <main className="min-h-[70vh] p-1 text-[#432d1e] sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9c4a9] pb-4">
        <div>
          <a href={backHref} className="inline-flex items-center gap-1 text-xs font-semibold text-[#806348] hover:text-[#4d3422]"><ArrowLeft size={14} /> Quay lại</a>
          <h1 className="mt-2 text-xl font-black sm:text-2xl">Yêu cầu tư vấn / xem phòng</h1>
          <p className="mt-1 text-sm text-[#806348]">Danh sách phân trang, chỉ hiển thị các yêu cầu trong phạm vi bạn được phân quyền.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select aria-label="Lọc trạng thái yêu cầu" value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value as "all" | Status); }} className={`${SELECT_CLASS} min-w-0 flex-1 sm:flex-none`}>
            <option value="new">Mới</option>
            <option value="contacted">Đã liên hệ</option>
            <option value="scheduled">Đã lên lịch</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã hủy</option>
            <option value="all">Tất cả</option>
          </select>
          <select aria-label="Lọc loại yêu cầu" value={typeFilter} onChange={(event) => { setPage(1); setTypeFilter(event.target.value as RequestTypeFilter); }} className={`${SELECT_CLASS} min-w-0 flex-1 sm:flex-none`}>
            <option value="all">Mọi nhu cầu</option>
            <option value="consultation">Tư vấn</option>
            <option value="viewing">Xem phòng</option>
          </select>
          <button type="button" aria-label="Tải lại" onClick={() => void loadRequests()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dac9b6] bg-white text-[#684324] hover:bg-[#fff8ed] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {success ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p> : null}
      {loading ? <div className="py-12 text-center text-sm text-[#806348]">Đang tải yêu cầu…</div> : requests.length === 0 ? <div className="py-14 text-center text-sm text-[#806348]">Chưa có yêu cầu trong trạng thái này.</div> : (
        <div className="mt-4 grid gap-3">
          {requests.map((item) => <article key={item.id} className="grid gap-4 rounded-2xl border border-[#ddcbb7] bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-[#3e2b1d]">{item.request_type === "viewing" ? "Đặt lịch xem phòng" : "Tư vấn phòng"} · {item.room_code_snapshot}</h2>
                <span className="rounded-full bg-[#f5ead9] px-2.5 py-1 text-[11px] font-bold text-[#705035]">{STATUS_LABEL[item.status]}</span>
              </div>
              <p className="mt-1 text-sm text-[#806348]">{item.room_type_snapshot || "Phòng cho thuê"}{item.address_snapshot ? ` · ${item.address_snapshot}` : ""}</p>
              {item.price_snapshot ? <p className="mt-1 text-sm font-bold text-[#795626]">{Number(item.price_snapshot).toLocaleString("vi-VN")} đ/tháng</p> : null}
              <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <p><span className="text-[#806348]">Khách: </span><b>{item.guest_name}</b></p>
                <p className="flex flex-wrap items-center gap-2"><span><span className="text-[#806348]">SĐT: </span><a className="font-bold text-[#775126] underline" href={`tel:${item.guest_phone}`}>{item.guest_phone}</a></span><button type="button" onClick={() => void copyPhone(item.id, item.guest_phone)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#dac9b6] px-2 text-xs font-semibold text-[#684324] hover:bg-[#fff8ed]"><Copy size={12} />{copiedId === item.id ? "Đã sao chép" : "Sao chép"}</button></p>
                {item.viewing_date ? <p><span className="text-[#806348]">Ngày xem: </span><b>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${item.viewing_date}T12:00:00+07:00`))}</b></p> : null}
                {item.preferred_time ? <p><span className="text-[#806348]">Khung giờ: </span><b>{item.preferred_time}</b></p> : null}
                <p className="text-xs text-[#9a7e63]">Gửi lúc {formatDate(item.created_at)}</p>
              </div>
              {item.notes ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#faf5ed] p-3 text-sm leading-5 text-[#634a33]">{item.notes}</p> : null}
            </div>
            <div className="flex flex-row items-center gap-2 sm:flex-col sm:items-stretch">
              {item.room_id ? <a href={`/rooms/${encodeURIComponent(item.room_id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#dac9b6] px-3 text-xs font-bold text-[#684324] hover:bg-[#fff8ed]">Mở phòng <ExternalLink size={13} /></a> : null}
              <select aria-label={`Cập nhật trạng thái ${item.room_code_snapshot}`} value={item.status} disabled={updatingId === item.id} onChange={(event) => void updateStatus(item.id, event.target.value as Status)} className={SELECT_CLASS}>
                {(Object.keys(STATUS_LABEL) as Status[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
              </select>
            </div>
          </article>)}
        </div>
      )}
      {!loading && total > 0 ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9c4a9] pt-4 text-sm text-[#806348]">
        <span>{total.toLocaleString("vi-VN")} yêu cầu · Trang {page} / {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-10 rounded-xl border border-[#dac9b6] bg-white px-4 font-semibold text-[#684324] disabled:opacity-45">Trước</button>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="min-h-10 rounded-xl border border-[#dac9b6] bg-white px-4 font-semibold text-[#684324] disabled:opacity-45">Tiếp</button>
        </div>
      </div> : null}
    </main>
  );
}
