"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { readApiResponse } from "@/lib/api/client";
import OwnerRegistrationCaptcha from "@/components/owner/OwnerRegistrationCaptcha";

type Props = {
  open: boolean;
  room: {
    id: string;
    code: string;
    type: string;
    address: string;
    price: number | null;
    image: string | null;
    href: string;
  };
  onClose: () => void;
};

type SubmitResult = { request_id: string; duplicate: boolean; notified_admins: number };

function localDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function createRequestKey() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-white/[.06] px-3.5 py-2.5 text-[16px] text-[#F3E7D6] outline-none placeholder:text-white/40 focus:border-[#C9A46A]/70 focus:ring-2 focus:ring-[#C9A46A]/20";

export default function RoomInquiryModal({ open, room, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [requestType, setRequestType] = useState<"consultation" | "viewing">("consultation");
  const [viewingDate, setViewingDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const requestKey = useMemo(createRequestKey, []);
  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, submitting]);

  if (!open || !mounted) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (requestType === "viewing" && !viewingDate) {
      setError("Vui lòng chọn ngày muốn xem phòng.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await readApiResponse<SubmitResult>(await fetch("/api/room-consult-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_key: requestKey,
          room_id: room.id,
          guest_name: name,
          guest_phone: phone,
          request_type: requestType,
          viewing_date: requestType === "viewing" ? viewingDate : null,
          preferred_time: requestType === "viewing" ? preferredTime || null : null,
          notes: notes || null,
          website,
          captcha_token: captchaToken,
        }),
      }));
      setSuccess(result.duplicate
        ? "Yêu cầu này đã được gửi gần đây. Bộ phận phụ trách sẽ liên hệ với bạn."
        : "Yêu cầu đã được lưu và gửi đến bộ phận phụ trách. Chúng tôi sẽ liên hệ với bạn sớm.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không gửi được yêu cầu. Vui lòng thử lại.");
      setCaptchaToken("");
      setCaptchaResetKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-end justify-center bg-black/65 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="room-inquiry-title" className="max-h-[94dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[26px] border border-[#C9A46A]/35 bg-[#2D1B14] text-[#F3E7D6] shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:rounded-[26px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#2D1B14]/95 px-5 py-4 backdrop-blur-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C9A46A]">Liên hệ phòng</p>
            <h2 id="room-inquiry-title" className="mt-1 text-lg font-semibold">Tư vấn hoặc đặt lịch xem phòng</h2>
          </div>
          <button type="button" aria-label="Đóng" disabled={submitting} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-xl hover:bg-white/10 disabled:opacity-50">×</button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5 flex gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3">
            {room.image ? <img src={room.image} alt="" className="h-[76px] w-[92px] shrink-0 rounded-xl object-cover" /> : <div className="grid h-[76px] w-[92px] shrink-0 place-items-center rounded-xl bg-white/[.06] text-2xl" aria-hidden="true">⌂</div>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{room.type || "Phòng cho thuê"} <span className="font-normal text-[#D8C7B5]">· {room.code}</span></p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#D8C7B5]">{room.address}</p>
              <p className="mt-1 text-sm font-bold text-[#E7C58F]">{room.price ? `${room.price.toLocaleString("vi-VN")} đ/tháng` : "Liên hệ để biết giá"}</p>
            </div>
            <a href={room.href} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-[#E7C58F] underline underline-offset-2">Chi tiết</a>
          </div>

          {success ? (
            <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-300/25 bg-emerald-950/35 p-5 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-400/15 text-xl text-emerald-200">✓</span>
              <p className="mt-3 font-semibold">Đã nhận yêu cầu</p>
              <p className="mt-1 text-sm leading-6 text-emerald-100/80">{success}</p>
              <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-xl bg-[#C9A46A] px-5 font-bold text-[#241206]">Đóng</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Họ và tên *<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} autoComplete="name" required placeholder="Tên của bạn" /></label>
                <label className="text-sm font-medium">Số điện thoại *<input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} minLength={9} maxLength={24} autoComplete="tel" inputMode="tel" required placeholder="09xx xxx xxx" /></label>
              </div>

              <fieldset>
                <legend className="text-sm font-medium">Bạn cần hỗ trợ gì?</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${requestType === "consultation" ? "border-[#C9A46A]/60 bg-[#C9A46A]/15" : "border-white/12 bg-white/[.03]"}`}><input type="radio" name="request_type" value="consultation" checked={requestType === "consultation"} onChange={() => setRequestType("consultation")} className="accent-[#C9A46A]" />Tư vấn thêm</label>
                  <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${requestType === "viewing" ? "border-[#C9A46A]/60 bg-[#C9A46A]/15" : "border-white/12 bg-white/[.03]"}`}><input type="radio" name="request_type" value="viewing" checked={requestType === "viewing"} onChange={() => setRequestType("viewing")} className="accent-[#C9A46A]" />Đặt lịch xem</label>
                </div>
              </fieldset>

              {requestType === "viewing" ? <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Ngày muốn xem *<input className={inputClass} type="date" min={localDateValue()} value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} required /></label>
                <label className="text-sm font-medium">Khung giờ mong muốn<select className={inputClass} value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)}><option value="">Linh động</option><option value="Sáng (08:00–12:00)">Sáng (08:00–12:00)</option><option value="Chiều (12:00–17:00)">Chiều (12:00–17:00)</option><option value="Tối (17:00–20:00)">Tối (17:00–20:00)</option></select></label>
              </div> : null}

              <label className="text-sm font-medium">Ghi chú tùy chọn<textarea className={`${inputClass} min-h-[88px] resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Thời gian tiện liên hệ hoặc yêu cầu thêm" /></label>
              <label className="sr-only" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>

              <OwnerRegistrationCaptcha key={captchaResetKey} onToken={handleCaptchaToken} />

              {error ? <p role="alert" className="rounded-xl border border-red-300/20 bg-red-950/35 px-3.5 py-3 text-sm text-red-200">{error}</p> : null}
              <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-white/10 bg-[#2D1B14]/95 px-5 py-4 backdrop-blur-sm sm:-mx-6 sm:-mb-6 sm:px-6">
                <button type="submit" disabled={submitting || !captchaToken} className="min-h-12 w-full rounded-xl bg-[#C9A46A] px-5 font-bold text-[#241206] transition hover:bg-[#D9B77F] disabled:cursor-wait disabled:opacity-60">{submitting ? "Đang gửi yêu cầu…" : "Gửi yêu cầu"}</button>
                <p className="mt-2 text-center text-[11px] leading-4 text-[#D8C7B5]">Thông tin sẽ được gửi đến người phụ trách phòng này.</p>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
