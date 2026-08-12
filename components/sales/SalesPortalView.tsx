"use client";

import { useMemo, useRef, useState } from "react";
import { Building2, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Info, MapPin, X } from "lucide-react";

import type { SalesPortalData, SalesRoomStatus } from "@/lib/sales-portal/types";

const FILTERS: Array<{ value: "all" | SalesRoomStatus; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "Trống", label: "Trống" },
  { value: "Sắp trống", label: "Sắp trống" },
  { value: "Đang thuê", label: "Đang thuê" },
];

export default function SalesPortalView({ data }: { data: SalesPortalData }) {
  const [filter, setFilter] = useState<"all" | SalesRoomStatus>("all");
  const [buildingInfoOpen, setBuildingInfoOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const rooms = useMemo(() => filter === "all" ? data.rooms : data.rooms.filter((room) => room.status === filter), [data.rooms, filter]);
  const documentOrigins = useMemo(() => Array.from(new Set(data.documents.flatMap((document) => { try { return [new URL(document.file_url).origin]; } catch { return []; } }))), [data.documents]);
  const hero = data.property.cover_image || data.property.gallery_images[0];

  return (
    <main className="min-h-screen bg-[#f4eadc] pb-12 text-[#432918]">
      {documentOrigins.map((origin) => <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />)}
      <header className="sticky top-0 z-30 border-b border-[#6f4526]/20 bg-[#704522]/95 text-[#fff6e8] shadow-lg backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white/10"><img src="/logo.png" alt="KimLan" className="h-9 w-9 object-contain" /></span>
          <div><p className="font-bold">Trang thông tin cho Sales</p><p className="text-xs text-[#f0d9bf]">Dữ liệu cập nhật trực tiếp từ chủ nhà</p></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <section className="grid overflow-hidden rounded-[24px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_16px_40px_rgba(92,61,34,0.1)] lg:grid-cols-[minmax(320px,.85fr)_minmax(0,1.15fr)]">
          <div className="min-h-56 bg-[#dfc8aa]">{hero ? <img src={hero} alt={data.property.name} className="h-full max-h-[420px] w-full object-cover" /> : <div className="grid h-full min-h-64 place-items-center text-[#85684f]"><Building2 size={56} /></div>}</div>
          <div className="p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#997353]">Tòa nhà</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{data.property.name}</h1>
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#76573e]"><MapPin className="mt-1 shrink-0" size={16} />{data.property.full_address}</p>
            {data.property.google_maps_url ? <a href={data.property.google_maps_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#744722] hover:underline">Mở Google Maps <ExternalLink size={14} /></a> : null}
            {data.property.note ? <p className="mt-5 whitespace-pre-line text-sm leading-7 text-[#674b34]">{data.property.note}</p> : null}
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Metric label="Trống" value={data.summary["Trống"]} tone="green" />
              <Metric label="Sắp trống" value={data.summary["Sắp trống"]} tone="amber" />
              <Metric label="Đang thuê" value={data.summary["Đang thuê"]} tone="red" />
            </div>
            <button type="button" onClick={() => setBuildingInfoOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#9a704b]/25 bg-[#f8ead7] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#744722]/40 hover:shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#744722] text-white"><Info size={19} /></span>
              <span className="min-w-0"><strong className="block text-sm">Thông tin dành cho Sale</strong><span className="mt-0.5 block text-xs text-[#80634a]">Chính sách · Tiện ích · Chi phí · Quy định</span></span>
              <ChevronRight className="ml-auto shrink-0 text-[#744722]" size={18} />
            </button>
            <button type="button" onClick={() => setDocumentsOpen(true)} className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-[#9a704b]/25 bg-[#f8ead7] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#744722]/40 hover:shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#744722] text-white"><FileText size={19} /></span>
              <span className="min-w-0"><strong className="block text-sm">Tài liệu cho Sale</strong><span className="mt-0.5 block text-xs text-[#80634a]">{data.documents.length ? `${data.documents.length} tài liệu · Docs · Excel · Trang tính` : "Chưa có tài liệu được chia sẻ"}</span></span>
              <ChevronRight className="ml-auto shrink-0 text-[#744722]" size={18} />
            </button>
          </div>
        </section>

        <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold">Danh sách phòng</h2><p className="mt-1 text-sm text-[#80634a]">Chỉ hiển thị trạng thái phục vụ bán hàng.</p></div><div className="flex max-w-full gap-2 overflow-x-auto pb-1">{FILTERS.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition ${filter === item.value ? "bg-[#744722] text-white" : "bg-[#f2dfc6] text-[#684324]"}`}>{item.label}</button>)}</div></div>
          {rooms.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rooms.map((room) => <article key={room.id} className="overflow-hidden rounded-2xl border border-[#a9825f]/20 bg-white"><RoomImageGallery room={room} /><div className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Phòng {room.room_code || "-"}</h3><p className="mt-1 text-xs text-[#80634a]">{room.room_type || "Chưa cập nhật loại phòng"}</p></div><p className="shrink-0 font-bold text-[#744722]">{money(room.price)}</p></div>{room.available_at ? <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-700"><CalendarClock size={15} />Trống từ {date(room.available_at)}</p> : null}{room.sales_note ? <div className="mt-3 rounded-xl bg-[#fff3d8] p-3 text-sm leading-6 text-[#674b34]"><strong className="block text-xs uppercase text-[#8a5a28]">Ghi chú cho Sale</strong>{room.sales_note}</div> : null}{room.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#76573e]">{room.description}</p> : null}</div></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#a9825f]/35 px-5 py-10 text-center text-sm text-[#80634a]">Không có phòng phù hợp với bộ lọc.</div>}
        </section>
      </div>
      {buildingInfoOpen ? <BuildingInfoModal data={data} onClose={() => setBuildingInfoOpen(false)} /> : null}
      {documentsOpen ? <SalesDocumentsModal data={data} onClose={() => setDocumentsOpen(false)} /> : null}
    </main>
  );
}

function RoomImageGallery({ room }: { room: SalesPortalData["rooms"][number] }) {
  const images = room.media.filter((item) => item.type === "image");
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ id: number; startX: number } | null>(null);
  const move = (direction: number) => setIndex((current) => (current + direction + images.length) % images.length);
  const finishDrag = (pointerId: number) => {
    if (drag.current?.id !== pointerId) return;
    if (Math.abs(dragX) > 45) move(dragX < 0 ? 1 : -1);
    drag.current = null;
    setDragX(0);
  };

  if (!images.length) return <div className="relative grid aspect-[16/10] place-items-center bg-[#ead9c2] text-[#98785b]"><Building2 size={38} /><StatusBadge status={room.status} /></div>;

  return <div className="group relative aspect-[16/10] touch-pan-y select-none overflow-hidden bg-[#ead9c2] cursor-grab active:cursor-grabbing" onPointerDown={(event) => { drag.current = { id: event.pointerId, startX: event.clientX }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current?.id === event.pointerId) setDragX(event.clientX - drag.current.startX); }} onPointerUp={(event) => finishDrag(event.pointerId)} onPointerCancel={(event) => finishDrag(event.pointerId)}>
    <img src={images[index].url} alt={`Ảnh phòng ${room.room_code ?? ""} - ${index + 1}`} draggable={false} className="h-full w-full object-cover transition-transform duration-150" style={{ transform: `translateX(${dragX}px) scale(${dragX ? .985 : 1})` }} />
    <StatusBadge status={room.status} />
    {images.length > 1 ? <><button type="button" aria-label="Ảnh trước" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(-1)} className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover:opacity-100 focus:opacity-100"><ChevronLeft size={18} /></button><button type="button" aria-label="Ảnh tiếp theo" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(1)} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/65 group-hover:opacity-100 focus:opacity-100"><ChevronRight size={18} /></button><span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">{index + 1}/{images.length}</span><div className="absolute bottom-3 left-1/2 flex max-w-[55%] -translate-x-1/2 gap-1">{images.map((image, imageIndex) => <button key={image.id} type="button" aria-label={`Xem ảnh ${imageIndex + 1}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setIndex(imageIndex)} className={`h-1.5 rounded-full transition-all ${imageIndex === index ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />)}</div></> : null}
  </div>;
}

function BuildingInfoModal({ data, onClose }: { data: SalesPortalData; onClose: () => void }) {
  const info = data.building_info;
  const [copied, setCopied] = useState(false);
  const hasContent = info.room_types.length || info.amenities.length || info.fees.length || info.policy || info.contact_phones.length;
  const copyAll = async () => {
    await copyText(buildingInfoCopyText(data));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Thông tin dành cho Sale" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[90vh] w-full overflow-hidden rounded-t-[24px] bg-[#fff9ef] shadow-2xl sm:max-w-2xl sm:rounded-[24px]">
      <div className="flex items-center justify-between border-b border-[#956b45]/20 px-5 py-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#997353]">Thông tin dành cho Sale</p><h2 className="mt-1 truncate text-lg font-bold">{data.property.full_address}</h2></div><div className="ml-3 flex shrink-0 items-center gap-2"><button type="button" onClick={copyAll} aria-label="Copy toàn bộ thông tin" className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition ${copied ? "bg-emerald-600 text-white" : "bg-[#744722] text-white hover:bg-[#5f3518]"}`}>{copied ? <Check size={16} /> : <Copy size={16} />}<span className="hidden sm:inline">{copied ? "Đã copy" : "Copy"}</span></button><button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-full bg-[#f2dfc6] text-[#684324]"><X size={19} /></button></div></div>
      <div className="max-h-[calc(90vh-78px)] space-y-5 overflow-y-auto overscroll-contain p-5 text-sm leading-6 text-[#674b34]">
        {(info.room_types.length || info.min_price != null) ? <InfoGroup title="Loại phòng & giá thuê"><ul className="space-y-1">{info.room_types.length ? <li>• Đa dạng loại phòng: {info.room_types.join(", ")}.</li> : null}{info.min_price != null ? <li>• Giá thuê từ {money(info.min_price)}{info.max_price != null && info.max_price !== info.min_price ? ` đến ${money(info.max_price)}` : ""}.</li> : null}</ul></InfoGroup> : null}
        {info.amenities.length ? <InfoGroup title="Tiện ích / Tiện nghi"><ul className="grid gap-1 sm:grid-cols-2">{info.amenities.map((item) => <li key={item}>+ {item}</li>)}</ul></InfoGroup> : null}
        {(info.fees.length || info.other_fee_note) ? <InfoGroup title="Chi phí"><ul className="space-y-1">{info.fees.map((fee) => <li key={fee.label}>+ {fee.label}: {money(fee.value)}{fee.unit ? ` / ${fee.unit}` : ""}</li>)}{info.other_fee_note ? <li className="whitespace-pre-line">+ {info.other_fee_note}</li> : null}</ul></InfoGroup> : null}
        {info.policy ? <InfoGroup title="Chính sách & Quy định"><p className="whitespace-pre-line">{info.policy}</p></InfoGroup> : null}
        {info.contact_phones.length ? <InfoGroup title="Liên hệ"><div className="flex flex-wrap gap-2">{info.contact_phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="rounded-full bg-[#744722] px-3 py-1.5 font-semibold text-white">{phone}</a>)}</div></InfoGroup> : null}
        {!hasContent ? <p className="rounded-2xl border border-dashed border-[#a9825f]/35 p-6 text-center text-[#80634a]">Chủ nhà chưa cập nhật thông tin chính sách, tiện ích và chi phí.</p> : null}
      </div>
    </section>
  </div>;
}

function SalesDocumentsModal({ data, onClose }: { data: SalesPortalData; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Tài liệu cho Sale" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[85vh] w-full overflow-hidden rounded-t-[24px] bg-[#fff9ef] shadow-2xl sm:max-w-2xl sm:rounded-[24px]">
      <div className="flex items-center justify-between border-b border-[#956b45]/20 px-5 py-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#997353]">Tài liệu cho Sale</p><h2 className="mt-1 truncate text-lg font-bold">{data.property.full_address}</h2></div><button type="button" onClick={onClose} aria-label="Đóng" className="ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f2dfc6] text-[#684324]"><X size={19} /></button></div>
      <div className="max-h-[calc(85vh-78px)] overflow-y-auto overscroll-contain p-5">
        {data.documents.length ? <div className="grid gap-3 sm:grid-cols-2">{data.documents.map((document) => <a key={document.id} href={document.file_url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#a9825f]/20 bg-[#f8ead7] p-4 text-[#432918] transition hover:-translate-y-0.5 hover:border-[#744722]/35 hover:shadow-md"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#744722] text-white"><Download size={19} /></span><span className="min-w-0"><strong className="block truncate text-sm">{document.title}</strong><span className="mt-1 block truncate text-xs text-[#80634a]">{document.description || document.file_name}</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#744722]">Mở tài liệu <ExternalLink size={12} /></span></span></a>)}</div> : <div className="rounded-2xl border border-dashed border-[#a9825f]/35 px-5 py-10 text-center"><FileText className="mx-auto text-[#a9825f]" size={38} /><p className="mt-3 text-sm font-semibold text-[#674b34]">Chưa có tài liệu được chia sẻ</p><p className="mt-1 text-xs text-[#80634a]">Chủ nhà có thể bổ sung link Docs, Excel, trang tính hoặc các file liên quan.</p></div>}
      </div>
    </section>
  </div>;
}

function buildingInfoCopyText(data: SalesPortalData) {
  const info = data.building_info;
  const sections: string[] = [data.property.full_address];
  const roomLines = [
    info.room_types.length ? `• Đa dạng loại phòng: ${info.room_types.join(", ")}.` : "",
    info.min_price != null ? `• Giá thuê từ ${money(info.min_price)}${info.max_price != null && info.max_price !== info.min_price ? ` đến ${money(info.max_price)}` : ""}.` : "",
  ].filter(Boolean);
  if (roomLines.length) sections.push(`LOẠI PHÒNG & GIÁ THUÊ\n${roomLines.join("\n")}`);
  if (info.amenities.length) sections.push(`TIỆN ÍCH / TIỆN NGHI\n${info.amenities.map((item) => `+ ${item}`).join("\n")}`);
  const feeLines = [...info.fees.map((fee) => `+ ${fee.label}: ${money(fee.value)}${fee.unit ? ` / ${fee.unit}` : ""}`), ...(info.other_fee_note ? [`+ ${info.other_fee_note}`] : [])];
  if (feeLines.length) sections.push(`CHI PHÍ\n${feeLines.join("\n")}`);
  if (info.policy) sections.push(`CHÍNH SÁCH & QUY ĐỊNH\n${info.policy}`);
  if (info.contact_phones.length) sections.push(`LIÊN HỆ\n${info.contact_phones.join(" - ")}`);
  return sections.join("\n\n");
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function InfoGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div><h3 className="mb-2 font-bold uppercase tracking-wide text-[#744722]">{title}</h3><div className="rounded-2xl bg-[#f8ead7] p-4">{children}</div></div>; }

function Metric({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" }) { const colors = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" }; return <div className={`rounded-2xl p-3 text-center ${colors[tone]}`}><p className="text-xl font-bold">{value}</p><p className="mt-1 text-[11px] font-semibold">{label}</p></div>; }
function StatusBadge({ status }: { status: SalesRoomStatus }) { const cls = status === "Trống" ? "bg-emerald-600" : status === "Sắp trống" ? "bg-amber-500" : "bg-red-600"; return <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold text-white shadow ${cls}`}>{status}</span>; }
function money(value: number | null) { return value == null ? "Liên hệ" : `${value.toLocaleString("vi-VN")}đ`; }
function date(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN"); }
