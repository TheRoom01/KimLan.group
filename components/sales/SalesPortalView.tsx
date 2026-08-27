"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Info, MapPin, Play, X } from "lucide-react";

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
  const [selectedRoom, setSelectedRoom] = useState<SalesPortalData["rooms"][number] | null>(null);
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
          {rooms.length ? <div className="mt-5 flex flex-wrap gap-3">{rooms.map((room) => <button key={room.id} type="button" onClick={() => setSelectedRoom(room)} aria-label={`Mở chi tiết phòng ${room.room_code || "-"}, ${room.room_type || "chưa cập nhật dạng phòng"}`} className={`group min-w-[104px] rounded-2xl border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#744722] focus-visible:ring-offset-2 ${roomBadgeClass(room.status)}`}><span className="block text-[15px] font-black leading-none tracking-tight">P. {room.room_code || "-"}</span><span className="mt-1.5 block max-w-[140px] truncate text-[11px] font-semibold leading-none opacity-80">{room.room_type || "Chưa phân loại"}</span></button>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#a9825f]/35 px-5 py-10 text-center text-sm text-[#80634a]">Không có phòng phù hợp với bộ lọc.</div>}
        </section>
      </div>
      {buildingInfoOpen ? <BuildingInfoModal data={data} onClose={() => setBuildingInfoOpen(false)} /> : null}
      {documentsOpen ? <SalesDocumentsModal data={data} onClose={() => setDocumentsOpen(false)} /> : null}
      {selectedRoom ? <SalesRoomModal room={selectedRoom} onClose={() => setSelectedRoom(null)} /> : null}
    </main>
  );
}

function RoomImageGallery({ room, expanded = false }: { room: SalesPortalData["rooms"][number]; expanded?: boolean }) {
  const mediaItems = useMemo(() => room.media.filter((item) => (item.type === "image" || item.type === "video") && item.url), [room.media]);
  const coverUrl = useMemo(() => room.media.find((item) => item.type === "image" && item.is_cover)?.url || room.media.find((item) => item.type === "image")?.url || "", [room.media]);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [slideDirection, setSlideDirection] = useState<-1 | 0 | 1>(0);
  const [snappingBack, setSnappingBack] = useState(false);
  const drag = useRef<{ id: number; startX: number; lastX: number; lastAt: number; velocity: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const updatedText = formatTimeAgo(room.updated_at);
  const previousIndex = (index - 1 + mediaItems.length) % mediaItems.length;
  const nextIndex = (index + 1) % mediaItems.length;

  useEffect(() => {
    if (mediaItems.length < 2) return;
    [mediaItems[previousIndex], mediaItems[nextIndex]].filter((item) => item?.type === "image").forEach((item) => {
      const image = new Image();
      image.src = String(item?.url);
      void image.decode?.().catch(() => undefined);
    });
  }, [mediaItems, nextIndex, previousIndex]);

  const move = (direction: -1 | 1) => {
    if (mediaItems.length < 2 || slideDirection !== 0 || snappingBack) return;
    videoRef.current?.pause();
    setDragX(0);
    setSlideDirection(direction);
  };

  const finishDrag = (pointerId: number) => {
    if (drag.current?.id !== pointerId) return;
    const distance = drag.current.lastX - drag.current.startX;
    const direction = distance < 0 ? 1 : -1;
    const shouldMove = Math.abs(distance) > 45 || Math.abs(drag.current.velocity) > 0.35;
    drag.current = null;
    if (shouldMove) move(direction);
    else if (Math.abs(distance) > 0.5) {
      setSnappingBack(true);
      setDragX(0);
    } else {
      setDragX(0);
    }
  };

  const finishSlide = () => {
    if (snappingBack) {
      setSnappingBack(false);
      return;
    }
    if (slideDirection === 0) return;
    setIndex((current) => (current + slideDirection + mediaItems.length) % mediaItems.length);
    setSlideDirection(0);
  };

  if (!mediaItems.length) return <div className={`relative grid place-items-center bg-[#ead9c2] text-[#98785b] ${expanded ? "min-h-56 sm:min-h-72" : "aspect-[16/10]"}`}><Building2 size={38} /><StatusBadge status={room.status} /></div>;

  const trackTransform = slideDirection === 1
    ? "translate3d(-200%,0,0)"
    : slideDirection === -1
      ? "translate3d(0,0,0)"
      : `translate3d(calc(-100% + ${dragX}px),0,0)`;
  const visibleIndexes = mediaItems.length > 1 ? [previousIndex, index, nextIndex] : [index];

  return <div className="overflow-hidden bg-black">
    <div
      className={`group relative touch-pan-y select-none overflow-hidden bg-black ${mediaItems.length > 1 ? "cursor-grab active:cursor-grabbing" : ""} ${expanded ? "h-[clamp(260px,52dvh,520px)]" : "aspect-[16/10]"}`}
      onPointerDown={(event) => {
        if (mediaItems.length < 2 || slideDirection !== 0 || snappingBack) return;
        drag.current = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, lastAt: performance.now(), velocity: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId || slideDirection !== 0) return;
        const now = performance.now();
        const elapsed = Math.max(1, now - drag.current.lastAt);
        drag.current.velocity = (event.clientX - drag.current.lastX) / elapsed;
        drag.current.lastX = event.clientX;
        drag.current.lastAt = now;
        setDragX(event.clientX - drag.current.startX);
      }}
      onPointerUp={(event) => finishDrag(event.pointerId)}
      onPointerCancel={(event) => finishDrag(event.pointerId)}
    >
      <div
        className={`flex h-full w-full will-change-transform ${slideDirection !== 0 || snappingBack ? "transition-transform duration-300 ease-out" : ""}`}
        style={{ transform: mediaItems.length > 1 ? trackTransform : undefined }}
        onTransitionEnd={finishSlide}
      >
        {visibleIndexes.map((mediaIndex, slot) => {
          const item = mediaItems[mediaIndex];
          const isCurrent = mediaItems.length === 1 || slot === 1;
          return <div key={`${item.id}-${slot}`} className="relative flex h-full w-full shrink-0 items-center justify-center bg-black">
            {item.type === "video" ? isCurrent ? <video ref={videoRef} src={item.url} poster={coverUrl || undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" onPointerDown={(event) => event.stopPropagation()} /> : <>{coverUrl ? <img src={coverUrl} alt="" draggable={false} className="h-full w-full object-contain" /> : null}<span className="pointer-events-none absolute grid h-14 w-14 place-items-center rounded-full bg-black/60 text-white backdrop-blur"><Play size={26} fill="currentColor" /></span></> : <img src={item.url} alt={`Ảnh phòng ${room.room_code ?? ""} - ${mediaIndex + 1}`} draggable={false} className={expanded ? "block max-h-full max-w-full object-contain" : "h-full w-full object-cover"} />}
          </div>;
        })}
      </div>
      {updatedText ? <span className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-24px)] rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-[10px] shadow-[0_6px_20px_rgba(0,0,0,0.35)]">Đã cập nhật: {updatedText}</span> : null}
      <StatusBadge status={room.status} />
      {mediaItems.length > 1 ? <><button type="button" aria-label="Media trước" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(-1)} className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-100 backdrop-blur transition hover:bg-black/70 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><ChevronLeft size={20} /></button><button type="button" aria-label="Media tiếp theo" onPointerDown={(event) => event.stopPropagation()} onClick={() => move(1)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white opacity-100 backdrop-blur transition hover:bg-black/70 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><ChevronRight size={20} /></button><span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">{index + 1}/{mediaItems.length}</span></> : null}
    </div>
    {expanded && mediaItems.length > 1 ? <div className="flex gap-2 overflow-x-auto bg-[#17120f] p-2 [scrollbar-color:#8b735f_#17120f] [scrollbar-width:thin]">{mediaItems.map((item, mediaIndex) => <button key={item.id} type="button" onClick={() => { if (slideDirection === 0 && !snappingBack) { videoRef.current?.pause(); setDragX(0); setIndex(mediaIndex); } }} className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-black transition sm:h-16 sm:w-24 ${mediaIndex === index ? "border-white" : "border-transparent opacity-65 hover:opacity-100"}`} aria-label={`Xem ${item.type === "video" ? "video" : "ảnh"} ${mediaIndex + 1}`}>{item.type === "video" ? <>{coverUrl ? <img src={coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}<span className="absolute inset-0 grid place-items-center bg-black/20 text-white"><Play size={18} fill="currentColor" /></span></> : <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />}</button>)}</div> : null}
  </div>;
}

function SalesRoomModal({ room, onClose }: { room: SalesPortalData["rooms"][number]; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const downloadableMedia = room.media.filter((item) => item.url);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  async function downloadMedia() {
    if (!downloadableMedia.length || downloading) return;
    setDownloading(true);
    setDownloadMessage(`Đang chuẩn bị 0/${downloadableMedia.length} media...`);
    try {
      const files: File[] = [];
      for (let index = 0; index < downloadableMedia.length; index += 1) {
        files.push(await salesRoomMediaFile(downloadableMedia[index], room.room_code || room.id, index));
        setDownloadMessage(`Đang chuẩn bị ${index + 1}/${downloadableMedia.length} media...`);
      }

      const canShareFiles = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files });
      if (canShareFiles) {
        try {
          await navigator.share({ title: `Media phòng ${room.room_code || ""}`, files });
          setDownloadMessage("Đã mở bảng lưu/chia sẻ media của thiết bị.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          // Một số trình duyệt báo có thể share file nhưng từ chối khi số file
          // hoặc dung lượng quá lớn. Khi đó tiếp tục tải từng file riêng biệt.
        }
      }

      files.forEach((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = file.name;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        window.setTimeout(() => {
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        }, index * 180);
      });
      setDownloadMessage(`Đang tải ${files.length} file media. Nếu trình duyệt hỏi, hãy cho phép tải nhiều tệp.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setDownloadMessage("Bạn đã đóng bảng lưu media.");
      } else {
        setDownloadMessage(error instanceof Error ? error.message : "Không thể tải media của phòng.");
      }
    } finally {
      setDownloading(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label={`Chi tiết phòng ${room.room_code || "-"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[24px] bg-[#fff9ef] shadow-2xl sm:max-w-3xl sm:rounded-[24px]">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#956b45]/20 bg-[#fff9ef]/95 px-4 py-3 backdrop-blur sm:px-5">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#997353]">Chi tiết phòng</p><h2 className="mt-0.5 text-xl font-bold">Phòng {room.room_code || "-"}</h2></div>
        <div className="ml-3 flex shrink-0 items-center gap-2"><button type="button" onClick={() => void downloadMedia()} disabled={downloading || !downloadableMedia.length} aria-label="Tải toàn bộ media phòng về thiết bị" title={downloadableMedia.length ? `Tải ${downloadableMedia.length} file media về thiết bị` : "Phòng chưa có media"} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#744722] px-3 text-xs font-bold text-white transition hover:bg-[#5f3518] disabled:cursor-not-allowed disabled:opacity-45">{downloading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Download size={16} />}<span className="hidden sm:inline">{downloading ? "Đang chuẩn bị" : "Tải media"}</span></button><button type="button" onClick={onClose} aria-label="Đóng chi tiết phòng" className="grid h-9 w-9 place-items-center rounded-full bg-[#f2dfc6] text-[#684324]"><X size={19} /></button></div>
      </div>
      <RoomImageGallery room={room} expanded />
      <div className="p-4 sm:p-5">
        {downloadMessage ? <p role="status" className="mb-4 rounded-xl border border-[#d9bd99] bg-[#f8ead7] px-3 py-2 text-xs font-semibold text-[#684324]">{downloadMessage}</p> : null}
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[#80634a]">{room.room_type || "Chưa cập nhật loại phòng"}</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${roomBadgeClass(room.status)}`}>{room.status}</span></div><p className="text-xl font-black text-[#744722]">{money(room.price)}</p></div>
        {room.available_at ? <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-700"><CalendarClock size={16} />Trống từ {date(room.available_at)}</p> : null}
        {room.sales_note ? <div className="mt-4 rounded-xl bg-[#fff3d8] p-4 text-sm leading-6 text-[#674b34]"><strong className="block text-xs uppercase text-[#8a5a28]">Ghi chú cho Sale</strong>{room.sales_note}</div> : null}
        {room.description ? <div className="mt-4 border-t border-[#956b45]/15 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-[#997353]">Mô tả</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#76573e]">{room.description}</p></div> : null}
      </div>
    </article>
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
function roomBadgeClass(status: SalesRoomStatus) { return status === "Trống" ? "border-emerald-700/35 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-900/15 hover:to-emerald-700" : status === "Sắp trống" ? "border-amber-600/35 bg-gradient-to-br from-amber-300 to-amber-400 text-amber-950 shadow-amber-900/15 hover:to-amber-500" : "border-red-700/35 bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-900/15 hover:to-red-700"; }
async function salesRoomMediaFile(media: { type: string; url: string }, roomCode: string, index: number) {
  const response = await fetch(`/api/share-image?url=${encodeURIComponent(media.url)}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Không thể tải media ${index + 1}.`);
  const blob = await response.blob();
  const mime = blob.type.toLowerCase();
  const extension = mediaFileExtension(mime, media.url);
  const safeRoomCode = String(roomCode || "phong").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "phong";
  const safeType = String(media.type || "media").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "media";
  return new File([blob], `phong-${safeRoomCode}-${safeType}-${String(index + 1).padStart(2, "0")}.${extension}`, { type: blob.type || "application/octet-stream" });
}

function mediaFileExtension(mime: string, url: string) {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-msvideo": "avi", "video/x-matroska": "mkv",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "application/pdf": "pdf",
  };
  if (byMime[mime]) return byMime[mime];
  try {
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (extension && extension.length <= 8) return extension;
  } catch {}
  return "bin";
}
function money(value: number | null) { return value == null ? "Liên hệ" : `${value.toLocaleString("vi-VN")}đ`; }
function date(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN"); }
function formatTimeAgo(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const difference = Math.max(0, Date.now() - parsed.getTime());
  const minutes = Math.floor(difference / 60000);
  const hours = Math.floor(difference / 3600000);
  const days = Math.floor(difference / 86400000);
  if (minutes < 1) return "vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30) return `${days} ngày trước`;
  return parsed.toLocaleDateString("vi-VN");
}
