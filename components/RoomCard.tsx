"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { isRoomSaved, toggleSavedRoom } from "@/lib/savedRooms";
import { createPortal } from "react-dom";

type Room = {
  id: string;
  room_code?: string | null;
  room_type: string;
  house_number?: string | null;
  address: string;
  ward?: string;
  district?: string;
  price: number;
  description?: string | null;
  status: "Trống" | "Đã thuê" | string;

  image_urls?: string[] | null;
  image_count?: number | null;

  has_video?: boolean;
  video_url?: string | null;
  thumb_url?: string | null;

  creator_admin_phone?: string | null;
  creator_admin_name?: string | null;
};

type RoomCardProps = {
  room: Room;
  adminLevel: number;
  index?: number;
  onNavigate: (href: string) => void;
};

function publicHouseNumber(value?: string | null) {
  const s = String(value || "").trim();

  // không có số nhà => vẫn hiện ...
  if (!s) return "...";

  if (s.includes("/")) {
    const first = s.split("/")[0]?.trim();
    return first ? `${first}/..` : "..";
  }

  if (/^\d+$/.test(s)) {
    return "..";
  }

  const m = s.match(/^(\d+)/);

  if (m?.[1]) {
    return `${m[1]}...`;
  }

  return "...";
}

export default function RoomCard({
  room,
  adminLevel,
  index = 0,
  onNavigate,
}: RoomCardProps) {
  const images = Array.isArray(room.image_urls)
    ? room.image_urls.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const showImages = images.slice(0, 3);

  const FALLBACK = "/no-image.png";

  const safeSrc = (src?: string | null) => {
    const s = (src ?? "").trim();
    return s ? s : FALLBACK;
  };


  // ✅ build thumb.webp theo UUID (room.id) để tránh trùng room_code
  // rooms/{uuid}/images/thumb.webp
  const R2_BASE =
    (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
      "")?.replace(/\/$/, "") || "";

  // Tổng số ảnh (ưu tiên image_count từ DB)
  const totalImages =
    typeof room.image_count === "number" && Number.isFinite(room.image_count)
      ? room.image_count
      : images.length;

  // ✅ Chỉ coi là "có media thật" khi còn ảnh hoặc có video
  const hasRealMedia = totalImages > 0 || !!room.has_video;

  // ✅ cache-bust thumb để tránh Cloudflare/R2 trả ảnh cũ sau khi xoá
  const thumbBust = hasRealMedia
    ? `${totalImages}-${(showImages[0] ?? "").slice(-24)}`
    : "0";

  const thumbUrl =
    R2_BASE && room.id
      ? `${R2_BASE}/rooms/${room.id}/images/thumb.webp?v=${encodeURIComponent(
          thumbBust
        )}`
      : "";

  const rpcThumbUrl = String(room.thumb_url ?? "").trim();
  const hasRpcThumb = !!rpcThumbUrl;

  // ✅ ưu tiên:
  // 1) thumb.webp tự build
  // 2) thumb_url từ RPC
  // 3) ảnh đầu
  const mainPrimary =
    room.has_video
      ? (thumbUrl || rpcThumbUrl || "")
      : safeSrc(showImages[0] ?? null);

  const mainFallback1 = safeSrc(rpcThumbUrl || (showImages[0] ?? null));

  const subImage1 = safeSrc(showImages[1] ?? "");
  const subImage2 = safeSrc(showImages[2] ?? "");

  // ✅ mainErrorStage:
  // 0: đang dùng thumb chính
  // 1: fallback sang thumb_url / ảnh đầu
  // 2: fallback sang video_url hoặc no-image
  const [mainErrorStage, setMainErrorStage] = useState<0 | 1 | 2>(0);
  const [sub1Ok, setSub1Ok] = useState(true);
  const [sub2Ok, setSub2Ok] = useState(true);
  const [adminPhone, setAdminPhone] = useState<string | null>(null);
const [saved, setSaved] = useState(false);
const [animating, setAnimating] = useState(false);

useEffect(() => {
  setSaved(isRoomSaved(room.id));
}, [room.id]);

  const mainSrc =
    mainErrorStage === 0
      ? mainPrimary
      : mainErrorStage === 1
      ? mainFallback1
      : FALLBACK;

  const sub1Src = sub1Ok ? subImage1 : FALLBACK;
  const sub2Src = sub2Ok ? subImage2 : FALLBACK;

  const price =
    (room as any).price ??
    (room as any).price_month ??
    (room as any).monthly_price ??
    null;

  const address =
    (room as any).address ??
    (room as any).address_short ??
    (room as any).location ??
    "";

  const ward =
    (room as any).ward ??
    (room as any).ward_name ??
    "";

  const district =
    (room as any).district ??
    (room as any).district_name ??
    "";

useEffect(() => {
  document.body.style.overflow = adminPhone ? "hidden" : "";
}, [adminPhone]);

  const level = Number(adminLevel) || 0;
  const isAdmin = level === 1 || level === 2;

  const href = `/rooms/${room.id}`;

return (
  <>
    <Link
      href={href}
      className="block"
      onClick={(e) => {
        e.preventDefault();
        onNavigate(href);
      }}
    >
      <div
        className="
        group relative z-0 overflow-hidden rounded-[18px]
        bg-[rgba(255,255,255,0.06)]
        backdrop-blur-[48px]
        border border-white/25
        shadow-[0_25px_100px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.25)]
        transition-all duration-300
        hover:-translate-y-1
        hover:bg-[rgba(255,255,255,0.10)]
        hover:border-white/35
      "
      >
        {/* glass layers */}
        <div
          className="
          pointer-events-none absolute inset-0 rounded-[18px]
          bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_50%)]
          opacity-40
        "
        />

        <div
          className="
          pointer-events-none absolute inset-0 rounded-[18px]
          bg-gradient-to-br from-white/25 via-transparent to-transparent
          opacity-30
        "
        />

        {/* SAVE BUTTON */}
        <button
  type="button"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();

    const nextSaved = toggleSavedRoom(room.id);
    setSaved(nextSaved);

    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
  }}
  className={`
    absolute right-2 top-2 z-30
    flex items-center justify-center

    w-[34px] aspect-square rounded-full
    
    bg-[rgba(225, 225, 225, 0.69)]
    backdrop-blur-[18px]

    border border-white/30

    shadow-[0_8px_24px_rgba(0,0,0,0.5)]

    transition-all duration-200
    hover:scale-110
    ${animating ? "scale-110" : "scale-100"}
  `}
>
  <svg
    viewBox="0 0 24 24"
    className={`
      w-[18px] h-[18px] transition-all duration-300
      ${
        saved
          ? "fill-yellow-400 stroke-yellow-400 drop-shadow-[0_0_10px_rgba(255,214,0,0.8)]"
          : "fill-transparent stroke-white"
      }
    `}
    strokeWidth="2"
  >
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
</button>

      {/* ADMIN BUTTON */}
      {room.creator_admin_phone && (
        <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAdminPhone(room.creator_admin_phone || null);
        }}
        className="
      absolute left-3 top-3 z-30

      flex items-center gap-1
      px-2 py-[3px]
      rounded-full

      text-[1px] font-semibold text-white

      bg-[linear-gradient(180deg,rgba(255, 255, 255, 0),rgba(255,255,255,0.03))]
      backdrop-blur-[14px]

      border border-white/25

      shadow-[0_4px_10px_rgba(0,0,0,0.25)]

      transition-all duration-150
      hover:bg-[rgba(255, 255, 255, 0)]
      hover:scale-[1.05]
      active:scale-[0.95]
      "
        title={room.creator_admin_name || "Liên hệ"}
      >
        <span className="text-[11px]">📞</span>
        <span>Admin</span>
      </button>
      )}

        {/* IMAGE */}
        <div className="h-[240px] overflow-hidden bg-black/20">
          <div className="grid grid-cols-[60%_40%] gap-1 h-full">
            <div className="relative w-full h-full overflow-hidden">
              {room.has_video && mainErrorStage >= 1 && room.video_url ? (
                <video
                  src={room.video_url}
                  className="w-full h-full object-cover object-[50%_40%]"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={mainSrc}
                  alt={room.room_type ?? "Hình phòng"}
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover object-[50%_40%]"
                  priority={index < 6}
                  loading={index < 6 ? "eager" : "lazy"}
                  unoptimized
                  onError={() => {
                    setMainErrorStage((s) =>
                      s < 2 ? ((s + 1) as 0 | 1 | 2) : 2
                    );
                  }}
                />
              )}

              {room.has_video && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 text-white text-2xl rounded-full w-12 h-12 flex items-center justify-center">
                    ▶
                  </div>
                </div>
              )}
            </div>

            {/* SUB IMAGES */}
            <div className="grid grid-rows-2 gap-1 relative h-full">
              {showImages[1] && (
                <div className="relative w-full h-full overflow-hidden">
                  <Image
                    src={sub1Src}
                    alt={
                      room.room_code
                        ? `Hình phòng ${room.room_code}`
                        : "Hình phòng"
                    }
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                    unoptimized
                    onError={() => setSub1Ok(false)}
                  />
                </div>
              )}

              {showImages[2] && (
                <div className="relative w-full h-full">
                  <Image
                    src={sub2Src}
                    alt={room.room_type ?? "Hình phòng"}
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                    unoptimized
                    onError={() => setSub2Ok(false)}
                  />

                  <div className="absolute inset-0 bg-black/30" />

                  {totalImages > 3 && (
                    <div className="absolute inset-0 flex items-center justify-center text-white text-lg font-semibold">
                      +{totalImages - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-medium text-[#A0856E] leading-5">
              {room.room_code && (
                <>
                  <span>Mã: </span>
                  <span className="font-semibold text-[13px] text-[#E5C9A9]/80">
                    {room.room_code}
                  </span>
                  <span> | </span>
                </>
              )}
              <span>Dạng: </span>
              <span className="font-semibold text-[#E5C9A9]">
                {room.room_type}
              </span>
            </h3>

            <span
              className={`text-xs px-2.5 py-[3px] rounded-full whitespace-nowrap font-semibold backdrop-blur-[12px] ${
                room.status === "Trống"
                  ? "bg-[#22c55e]/15 text-[#86efac] border border-[#22c55e]/30"
                  : "bg-white/10 text-white/60 border border-white/15"
              }`}
            >
              {room.status === "Trống" ? "Còn Trống" : "Đã thuê"}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-[18px] font-semibold text-[#60A5FA]">
              {price
                ? Number(price).toLocaleString("vi-VN") + " đ"
                : "Liên hệ"}
            </div>

            {room.description && (
              <div className="flex-1 text-[13px] font-semibold text-[#E5C9A9] text-right break-words whitespace-pre-line line-clamp-2">
                {room.description}
              </div>
            )}
          </div>
        </div>

        {/* ADDRESS */}
        <p className="text-white font-semibold leading-6 pb-3 px-3 drop-shadow-[0_1px_6px_rgba(255,255,255,0.25)]">
          📍{adminLevel === 1 || adminLevel === 2
                ? (room.house_number ? `${room.house_number} ` : "")
                : `${publicHouseNumber(room.house_number)} `
             }
          {address}
          {ward && `, P. ${ward}`}
          {district && `, ${district}`}
        </p>
      </div>
    </Link>

    {/* ADMIN MODAL */}
{adminPhone &&
  typeof window !== "undefined" &&
  createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={() => setAdminPhone(null)}
    >
      <div
        className="
        relative
        w-[88%] max-w-[250px] rounded-[20px]

        bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.06))]
        backdrop-blur-[42px]

        border border-white/30

        shadow-[
        0_30px_80px_rgba(0,0,0,0.75),
        inset_0_1px_0_rgba(255,255,255,0.7),
        inset_0_-1px_0_rgba(255,255,255,0.25),
        inset_0_0_30px_rgba(255,255,255,0.08)
        ]

        p-4
        animate-[fadeIn_0.2s_ease]

        before:absolute before:inset-0
        before:rounded-[20px]
        before:bg-[linear-gradient(120deg,rgba(255,255,255,0.35),transparent_40%)]
        before:opacity-40
        before:pointer-events-none
        "
        onClick={(e) => e.stopPropagation()}
      >
        

        {room.creator_admin_name && (
          <div className="mb-3 mt-1 text-center text-sm text-white/70">
            {room.creator_admin_name}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <a
            href={`tel:${adminPhone}`}
            className="w-full rounded-xl border border-white/20 bg-[rgba(66, 65, 65, 0.12)] py-3 text-center font-semibold text-white backdrop-blur-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
          >
            📞 Gọi điện
          </a>

          <a
            href={`https://zalo.me/${adminPhone}`}
            target="_blank"
            rel="noreferrer"
            className="w-full rounded-xl border border-white/20 bg-[rgba(255,255,255,0.12)] py-3 text-center font-semibold text-white backdrop-blur-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
          >
            <span className="flex items-center justify-center gap-2 leading-none">
              <img
                src="/zalo.svg"
                alt="Zalo"
                className="h-[20px] w-[20px]"
              />
              <span>Zalo</span>
            </span>
          </a>

          
        </div>
      </div>
    </div>,
    document.body
  )}
  </>
);}