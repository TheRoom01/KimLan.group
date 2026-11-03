"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { REFERRAL_SOURCES, vietnamesePhone } from "@/lib/consultation";
import styles from "./RoomInquiryModal.module.css";
import { readApiResponse } from "@/lib/api/client";
import RoomInquiryTurnstile, { type RoomInquiryTurnstileHandle } from "@/components/rooms/RoomInquiryTurnstile";

type Props = {
  open: boolean;
  room?: {
    id: string;
    code: string;
    type: string;
    address: string;
    price: number | null;
    image: string | null;
    href: string;
  };
  mode?: "room" | "general";
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

const inputClass = `mt-1.5 min-h-11 w-full rounded-xl border px-3.5 py-2.5 text-[16px] outline-none ${styles.input}`;

export default function RoomInquiryModal({ open, room, mode = "room", onClose }: Props) {
  const general = mode === "general";
  const dialogRef = useRef<HTMLElement>(null);
  const [referralSource, setReferralSource] = useState("");
  const [referralDetail, setReferralDetail] = useState("");
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [requestType, setRequestType] = useState<"consultation" | "viewing">("consultation");
  const [viewingDate, setViewingDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "verifying" | "submitting" | "success">("idle");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const turnstileRef = useRef<RoomInquiryTurnstileHandle>(null);
  const submissionInProgressRef = useRef(false);
  const submitting = submissionStatus === "verifying" || submissionStatus === "submitting";
  const succeeded = submissionStatus === "success";
  const requestKey = useMemo(createRequestKey, []);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
      if (event.key === "Tab") {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([tabindex="-1"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []).filter(element => element.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, [open, mounted]);

  if (!open || !mounted || (!general && !room)) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2 || (general && !vietnamesePhone(phone))) {
      setError("Vui lòng nhập họ tên và số điện thoại Việt Nam hợp lệ."); return;
    }
    if (!general && requestType === "viewing" && !viewingDate) {
      setError("Vui lòng chọn ngày muốn xem phòng.");
      return;
    }
    if (submissionInProgressRef.current) return;
    submissionInProgressRef.current = true;
    setSubmissionStatus("verifying");
    try {
      const captchaToken = await turnstileRef.current?.execute();
      if (!captchaToken) throw new Error("Chưa lấy được mã xác minh. Vui lòng thử lại.");
      setSubmissionStatus("submitting");
      const result = await readApiResponse<SubmitResult>(await fetch("/api/room-consult-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          request_key: requestKey,
          room_id: general ? null : room!.id,
          consultation_kind: general ? "general_consultation" : "room_consultation",
          referral_source: general ? referralSource || null : null,
          referral_detail: general ? referralDetail || null : null,
          guest_name: name,
          guest_phone: phone,
          request_type: general ? "consultation" : requestType,
          viewing_date: !general && requestType === "viewing" ? viewingDate : null,
          preferred_time: !general && requestType === "viewing" ? preferredTime || null : null,
          notes: notes || null,
          website,
          captcha_token: captchaToken,
        }),
      }));
      setSubmissionStatus("success");
      setSuccessMessage(result.duplicate
        ? "Yêu cầu này đã được gửi gần đây. Bộ phận phụ trách sẽ liên hệ với bạn."
        : "Yêu cầu đã được lưu và gửi đến bộ phận phụ trách. Chúng tôi sẽ liên hệ với bạn sớm.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không gửi được yêu cầu. Vui lòng thử lại.");
      turnstileRef.current?.reset();
      setSubmissionStatus("idle");
    } finally {
      submissionInProgressRef.current = false;
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-end justify-center bg-black/65 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="room-inquiry-title" className={`${styles.modal} outline-none max-h-[94dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[26px] border shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:rounded-[26px]`}>
        <div className={`${styles.header} sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-4`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#704526]">{general ? "The Room SG" : "Liên hệ phòng"}</p>
            <h2 id="room-inquiry-title" className="mt-1 text-lg font-semibold">{general ? "TƯ VẤN PHÒNG" : "Tư vấn hoặc đặt lịch xem phòng"}</h2>
          </div>
          <button type="button" aria-label="Đóng" disabled={submitting} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d9c6b3] text-xl hover:bg-black/5 disabled:opacity-50">×</button>
        </div>

        <div className="p-5 sm:p-6">
          {general ? <p className={`${styles.muted} mb-5 text-sm leading-6`}>Để lại thông tin, The Room SG sẽ hỗ trợ tìm phòng phù hợp với nhu cầu của bạn.</p> : room ? <div className={`${styles.group} mb-5 flex gap-3 rounded-2xl border p-3`}>
            {room.image ? <img src={room.image} alt="" className="h-[76px] w-[92px] shrink-0 rounded-xl object-cover" /> : <div className="grid h-[76px] w-[92px] shrink-0 place-items-center rounded-xl bg-[#efe4d5] text-2xl" aria-hidden="true">⌂</div>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{room.type || "Phòng cho thuê"} <span className="font-normal text-[#71675e]">· {room.code}</span></p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71675e]">{room.address}</p>
              <p className="mt-1 text-sm font-bold text-[#704526]">{room.price ? `${room.price.toLocaleString("vi-VN")} đ/tháng` : "Liên hệ để biết giá"}</p>
            </div>
            <a href={room.href} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-[#704526] underline underline-offset-2">Chi tiết</a>
          </div> : null}

          {succeeded ? (
            <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-xl text-emerald-800">✓</span>
              <p className="mt-3 font-semibold">Đã nhận yêu cầu</p>
              <p className="mt-1 text-sm leading-6 text-emerald-900">{successMessage}</p>
              <button type="button" onClick={onClose} className={`${styles.primary} mt-4 min-h-11 rounded-xl px-5 font-bold`}>Đóng</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Họ và tên *<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} autoComplete="name" required placeholder="Tên của bạn" /></label>
                <label className="text-sm font-medium">Số điện thoại *<input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} minLength={9} maxLength={24} autoComplete="tel" inputMode="tel" required placeholder="09xx xxx xxx" /></label>
              </div>

              {!general ? <fieldset>
                <legend className="text-sm font-medium">Bạn cần hỗ trợ gì?</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${requestType === "consultation" ? "border-[#704526] bg-[#efe4d5]" : "border-[#d9c6b3] bg-white"}`}><input type="radio" name="request_type" value="consultation" checked={requestType === "consultation"} onChange={() => setRequestType("consultation")} className="accent-[#704526]" />Tư vấn thêm</label>
                  <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${!general && requestType === "viewing" ? "border-[#704526] bg-[#efe4d5]" : "border-[#d9c6b3] bg-white"}`}><input type="radio" name="request_type" value="viewing" checked={requestType === "viewing"} onChange={() => setRequestType("viewing")} className="accent-[#704526]" />Đặt lịch xem</label>
                </div>
              </fieldset> : <fieldset><legend className="text-sm font-medium">Bạn cần hỗ trợ gì?</legend><label className={`${styles.group} mt-2 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm`}><input type="radio" checked readOnly name="general_support" className="accent-[#704526]" />Tư vấn tìm phòng</label></fieldset>}

              {!general && requestType === "viewing" ? <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Ngày muốn xem *<input className={inputClass} type="date" min={localDateValue()} value={viewingDate} onChange={(event) => setViewingDate(event.target.value)} required /></label>
                <label className="text-sm font-medium">Khung giờ mong muốn<select aria-label="Khung giờ mong muốn" className={inputClass} style={{ colorScheme: "light" }} value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)}><option value="">Linh động</option><option value="Sáng (08:00–12:00)">Sáng (08:00–12:00)</option><option value="Chiều (12:00–17:00)">Chiều (12:00–17:00)</option><option value="Tối (17:00–20:00)">Tối (17:00–20:00)</option></select></label>
              </div> : null}

              <label className="block text-sm font-medium">Ghi chú nhu cầu<textarea className={`${inputClass} min-h-[88px] resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder={general ? "Khu vực, ngân sách, loại phòng, yêu cầu thêm…" : "Thời gian tiện liên hệ hoặc yêu cầu thêm"} /></label>
              {general && <>
                <fieldset><legend className="text-sm font-medium">Bạn biết đến The Room SG từ đâu?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">{REFERRAL_SOURCES.map(source => <label key={source} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${referralSource === source ? "border-[#704526] bg-[#efe4d5]" : "border-[#d9c6b3] bg-white"}`}><input type="radio" name="referral_source" value={source} checked={referralSource === source} onChange={() => setReferralSource(source)} className="accent-[#704526]" />{source}</label>)}</div>
                </fieldset>
                <label className="block text-sm font-medium">Kênh hoặc nguồn giới thiệu cụ thể<input className={inputClass} value={referralDetail} onChange={event => setReferralDetail(event.target.value)} maxLength={300} placeholder="VD: Tên nhóm Facebook, tài khoản TikTok, người giới thiệu..." /></label>
              </>}
              <label className="sr-only" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>

              <RoomInquiryTurnstile ref={turnstileRef} />

              {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">{error}</p> : null}
              <div className={`${styles.footer} sticky bottom-0 -mx-5 -mb-5 border-t px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6`}>
                <button type="submit" disabled={submitting} className={`${styles.primary} min-h-12 w-full rounded-xl px-5 font-bold transition disabled:cursor-wait disabled:opacity-60`}>{submissionStatus === "verifying" ? "Đang xác minh…" : submissionStatus === "submitting" ? "Đang gửi yêu cầu…" : general ? "Gửi yêu cầu tư vấn" : "Gửi yêu cầu"}</button>
                <p className="mt-2 text-center text-[11px] leading-4 text-[#71675e]">{general ? "Thông tin sẽ được gửi đến bộ phận tư vấn The Room SG." : "Thông tin sẽ được gửi đến người phụ trách phòng này."}</p>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
