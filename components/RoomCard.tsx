"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { isRoomSaved, toggleSavedRoom } from "@/lib/savedRooms";
import { createPortal } from "react-dom";
import ShareRoomModal from "@/components/share/ShareRoomModal";
import { supabase } from "@/lib/supabase";


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
  updated_at?: string | null;

  image_urls?: string[] | null;
  image_count?: number | null;

  has_video?: boolean;
  video_url?: string | null;
  video_urls?: string[] | null;
  thumb_url?: string | null;

  owner_id?: string | null;
  link_zalo?: string | null;
  zalo_phone?: string | null;

  creator_admin_phone?: string | null;
  creator_admin_name?: string | null;
};

type RoomCardProps = {
  room: Room;
  adminLevel: number;
  currentUserId?: string | null;
  currentAdminPhone?: string | null;
  currentAdminName?: string | null;
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

function formatTimeAgo(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30) return `${days} ngày trước`;

  return date.toLocaleDateString("vi-VN");
}

function normalizeStatus(v?: string | null) {
  const s = String(v ?? "").toLowerCase().trim();

  if (s.includes("thuê")) return "Đã thuê";
  if (s.includes("trống") || s === "trong") return "Trống";

  return "Trống";
}

function getFullImageUrls(roomData: any): string[] {
  const fromMedia = Array.isArray(roomData?.media)
    ? roomData.media
        .filter((m: any) => {
          const type = String(m?.type ?? m?.kind ?? "").toLowerCase();
          const url = String(m?.url ?? "").trim();
          return type === "image" && Boolean(url);
        })
        .sort((a: any, b: any) => {
          const aCover = a?.is_cover === true ? 0 : 1;
          const bCover = b?.is_cover === true ? 0 : 1;

          if (aCover !== bCover) return aCover - bCover;

          const aSort = Number.isFinite(Number(a?.sort_order))
            ? Number(a.sort_order)
            : 999999;

          const bSort = Number.isFinite(Number(b?.sort_order))
            ? Number(b.sort_order)
            : 999999;

          return aSort - bSort;
        })
        .map((m: any) => String(m.url).trim())
        .filter(Boolean)
    : [];

  const fromImageUrls = Array.isArray(roomData?.image_urls)
    ? roomData.image_urls.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

  return Array.from(new Set(fromMedia.length ? fromMedia : fromImageUrls));
}

function getFullVideoUrls(roomData: any): string[] {
  const fromMedia = Array.isArray(roomData?.media)
    ? roomData.media
        .filter((m: any) => {
          const type = String(m?.type ?? m?.kind ?? "").toLowerCase();
          const url = String(m?.url ?? "").trim();
          return type === "video" && Boolean(url);
        })
        .sort((a: any, b: any) => {
          const aSort = Number.isFinite(Number(a?.sort_order))
            ? Number(a.sort_order)
            : 999999;

          const bSort = Number.isFinite(Number(b?.sort_order))
            ? Number(b.sort_order)
            : 999999;

          return aSort - bSort;
        })
        .map((m: any) => String(m.url).trim())
        .filter(Boolean)
    : [];

  const fromVideoUrls = Array.isArray(roomData?.video_urls)
    ? roomData.video_urls.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const singleVideo = String(roomData?.video_url ?? "").trim();

  return Array.from(
    new Set([
      ...fromMedia,
      ...fromVideoUrls,
      ...(singleVideo ? [singleVideo] : []),
    ])
  );
}

export default function RoomCard({
  room,
  adminLevel,
  currentUserId,
  currentAdminPhone,
  currentAdminName,
  index = 0,
  onNavigate,
}: RoomCardProps) {

  const images = getFullImageUrls(room);
  const videos = getFullVideoUrls(room);
  const showImages = images.slice(0, 3);

  const FALLBACK = "/no-image.png";

  const safeSrc = (src?: string | null) => {
    const s = (src ?? "").trim();
    return s ? s : FALLBACK;
  };

  const updatedAt =
  (room as any).updated_at ??
  (room as any).updatedAt ??
  (room as any).last_updated_at ??
  null;

const [currentStatus, setCurrentStatus] = useState(
  normalizeStatus(room.status)
);

// đặt trước return, cùng chỗ với các const khác
const safeAdminLevel: 0 | 1 | 2 =
  adminLevel === 1 || adminLevel === 2 ? adminLevel : 0;

const [updatingStatus, setUpdatingStatus] = useState(false);

const [confirmStatus, setConfirmStatus] = useState<{
  prevStatus: string;
  nextStatus: string;
} | null>(null);

  const currentUserIdValue = String(currentUserId ?? "").trim();
  const roomOwnerId = String((room as any).owner_id ?? "").trim();
  const isOwnedByCurrentAdmin =
    Boolean(currentUserIdValue) && roomOwnerId === currentUserIdValue;

  const safeRoomForPrivateFields = useMemo(
    () =>
      isOwnedByCurrentAdmin
        ? room
        : {
            ...room,
            link_zalo: null,
            zalo_phone: null,
          },
    [isOwnedByCurrentAdmin, room]
  );

  useEffect(() => {
    setShareRoomData(safeRoomForPrivateFields);
  }, [safeRoomForPrivateFields]);

const isLoggedAdmin =
  Boolean(currentUserId) &&
  (safeAdminLevel === 1 || safeAdminLevel === 2);

// Admin đăng nhập: giữ nguyên fallback cũ.
// Anon VIP: chỉ nhận contact đã được HomeClient truyền từ link VIP.
// Anon thường: currentAdminPhone = null nên không hiện nút Admin.
const contactPhone = isLoggedAdmin
  ? String(
      currentAdminPhone ||
      room.creator_admin_phone ||
      room.zalo_phone ||
      ""
    ).trim() || null
  : String(currentAdminPhone ?? "").trim() || null;

const contactName = isLoggedAdmin
  ? String(
      currentAdminName ||
      room.creator_admin_name ||
      ""
    ).trim() || "Liên hệ"
  : String(currentAdminName ?? "").trim() || "Liên hệ";

  useEffect(() => {
  console.log("[ROOM ADMIN CONTACT]", {
    roomId: room.id,
    currentAdminPhone,
    creatorAdminPhone: room.creator_admin_phone,
    creatorAdminName: room.creator_admin_name,
    zaloPhone: room.zalo_phone,
  });
}, [
  room.id,
  currentAdminPhone,
  room.creator_admin_phone,
  room.creator_admin_name,
  room.zalo_phone,
]);

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
const [copiedAddress, setCopiedAddress] = useState(false);

const [shareOpen, setShareOpen] = useState(false);
const [shareRoomData, setShareRoomData] = useState<any>(room);
const [shareImages, setShareImages] = useState<string[]>(images);
const [shareVideos, setShareVideos] = useState<string[]>(videos);
const [loadingShareDetail, setLoadingShareDetail] = useState(false);

useEffect(() => {
  setSaved(isRoomSaved(room.id));
}, [room.id]);

useEffect(() => {
  setCurrentStatus(normalizeStatus(room.status));
}, [room.status]);

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
  const fullAddressText = [
    adminLevel === 1 || adminLevel === 2
      ? room.house_number
        ? `${room.house_number}`
        : ""
      : publicHouseNumber(room.house_number),
    address,
    ward ? `P. ${ward}` : "",
    district,
  ]
    .filter(Boolean)
    .join(", ");

    async function handleCopyAddress(
      e: React.MouseEvent<HTMLButtonElement>
    ) {
      e.preventDefault();
      e.stopPropagation();

      const text = String(fullAddressText ?? "").trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        setCopiedAddress(true);
        window.setTimeout(() => setCopiedAddress(false), 1200);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        setCopiedAddress(true);
        window.setTimeout(() => setCopiedAddress(false), 1200);
      }
    }

  // 1) THÊM HÀM NÀY ngay sau handleCopyAddress(...)
async function handleShareRoom(e: React.MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
  e.stopPropagation();

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${href}`
      : href;

  const title = room.room_code
    ? `Phòng ${room.room_code}`
    : "The Room";

  try {
    if (navigator.share) {
      await navigator.share({
        title,
        url,
      });
      return;
    }
  } catch {}

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

async function openAdminShareModal(e: React.MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
  e.stopPropagation();

  if (loadingShareDetail) return;

  setLoadingShareDetail(true);

  try {
    const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
      p_id: room.id,
      p_role: 0,
    });

    if (error) throw error;

    const fullRoom = data ?? room;
    const sanitizedFullRoom = isOwnedByCurrentAdmin
      ? fullRoom
      : {
          ...fullRoom,
          link_zalo: null,
          zalo_phone: null,
        };
    const fullImages = getFullImageUrls(sanitizedFullRoom);
    const fullVideos = getFullVideoUrls(sanitizedFullRoom);

    setShareRoomData(sanitizedFullRoom);
    setShareImages(fullImages.length ? fullImages : images);
    setShareVideos(fullVideos.length ? fullVideos : videos);
    setShareOpen(true);
    
  } catch (err) {
    console.error("openAdminShareModal error:", err);

    setShareRoomData(safeRoomForPrivateFields);
    setShareImages(images);
    setShareVideos(videos);
    setShareOpen(true);

  } finally {
    setLoadingShareDetail(false);
  }
}
  useEffect(() => {
  const prevOverflow = document.body.style.overflow;

  if (adminPhone) {
    document.body.style.overflow = "hidden";
  }

  return () => {
    document.body.style.overflow = prevOverflow;
  };
}, [adminPhone]);

  const level = Number(adminLevel) || 0;
  const isAdmin = level === 1 || level === 2;

  const href = `/rooms/${room.id}?modal=1`;

  const isRoomAvailable = currentStatus === "Trống";

const statusBadgeBaseClass =
  "inline-flex !min-h-0 items-center justify-center rounded-full font-bold leading-none whitespace-nowrap backdrop-blur-[12px] border";

const statusBadgeAnonClass =
  "h-[30px] min-w-[92px] px-1.5 py-0 text-[15px]";

const statusBadgeAdminClass =
  "!h-[30px] !min-h-0 !min-w-[92px] !px-1.5 !py-0 !text-[15px]";

const statusBadgeColorClass = isRoomAvailable
  ? "!bg-[#86efac] !text-[#14532d] !border-[#22c55e] shadow-[0_5px_16px_rgba(34,197,94,0.28)]"
  : "!bg-[#fecaca] !text-[#7f1d1d] !border-[#f87171] shadow-[0_5px_16px_rgba(239,68,68,0.24)]";

function handleToggleStatus(
  e: React.MouseEvent<HTMLButtonElement>
) {
  e.preventDefault();
  e.stopPropagation();

  if (!isAdmin || updatingStatus) return;

  const prevStatus = currentStatus;
  const nextStatus = isRoomAvailable ? "Đã thuê" : "Trống";

  setConfirmStatus({
    prevStatus,
    nextStatus,
  });
}

async function confirmToggleStatus() {
  if (!confirmStatus || updatingStatus) return;

  const prevStatus = confirmStatus.prevStatus;
  const nextStatus = confirmStatus.nextStatus;

  setConfirmStatus(null);
  setCurrentStatus(nextStatus);
  setUpdatingStatus(true);

  try {
    const res = await fetch(`/api/rooms/${room.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: nextStatus,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error || "Cập nhật trạng thái thất bại");
    }

    setCurrentStatus(normalizeStatus(json?.data?.status || nextStatus));
  } catch (err: any) {
    setCurrentStatus(prevStatus);
    alert(err?.message || "Cập nhật trạng thái thất bại");
  } finally {
    setUpdatingStatus(false);
  }
}

const roomMetaLabelColor = "#fff6ec";
const roomMetaValueColor = "#f8e9d8";
const roomMetaDividerColor = "rgba(229,201,169,0.9)";

console.log(room.updated_at, room);

return (
  <>
   <Link
      href={href}
      className="block h-full"
      onClick={(e) => {
        e.preventDefault();
        onNavigate(href);
      }}
    >
    <div
      className="
        group relative z-0 flex h-full min-w-0 flex-col overflow-hidden rounded-[18px]

        bg-[rgba(156,127,73,0.5)]
        backdrop-blur-[34px]
        backdrop-saturate-[185%]
        border border-[#D2B48C]/30

        shadow-[0_22px_70px_rgba(34,19,11,0.50),inset_0_1px_0_rgba(222,184,135,0.15)]

        transition-all duration-300
        hover:-translate-y-1
        hover:bg-[rgba(215,147,69,0.47)]
        hover:border-[#E5C9A9]/45
      "
    >
  {/* glass layers */}
  <div
    className="
      pointer-events-none absolute inset-0 rounded-[18px]
      bg-[radial-gradient(circle_at_30%_18%,rgba(150,121,87,0.47),transparent_52%)]
      opacity-34
    "
  />

  <div
    className="
      pointer-events-none absolute inset-0 rounded-[18px]
      bg-gradient-to-br from-[#DEB887]/10 via-transparent to-transparent
      opacity-28
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
          
          bg-black/35
          backdrop-blur-[10px]

          border border-white/20

          shadow-[0_8px_24px_rgba(0,0,0,0.35)]
          hover:bg-black/80

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
                : "fill-transparent stroke-white/90"
            }
          `}
          strokeWidth="2"
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      </button>
      

    {/* ADMIN BUTTON */}
    {contactPhone && (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAdminPhone(contactPhone);
        }}
        title={contactName}
        className="
          ai-admin-button ai-admin-gradient-border
          !absolute left-2 top-1 z-30

          !min-h-0 !h-[25px]
          rounded-full p-[1px]

          transition-all duration-50
          hover:scale-[1.05]
          active:scale-[0.95]
        "
      >
        <span
          className="
            flex h-full items-center gap-1
            rounded-full
            bg-[#141516]/75
            px-1
            !text-[14px] font-bold text-white
            leading-none
            backdrop-blur-[20px]
          "
        >
          <span className="text-[12px] leading-none">☎️</span>
          <span className="leading-none">Admin</span>
        </span>
      </button>
    )}

       {/* IMAGE */}
        <div className="aspect-[1.45/1] w-full overflow-hidden bg-black/20">
          <div className="grid h-full grid-cols-[60%_40%] gap-1">
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
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 25vw, 18vw"
                  className="object-cover object-[50%_40%]"
                  priority={index < 6}
                  loading={index < 6 ? "eager" : "lazy"}
                  unoptimized
                  onError={() => {
                    setMainErrorStage((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : 2));
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
                    sizes="(max-width: 640px) 40vw, (max-width: 1024px) 20vw, (max-width: 1536px) 10vw, 8vw"
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
                    sizes="(max-width: 640px) 40vw, (max-width: 1024px) 20vw, (max-width: 1536px) 10vw, 8vw"
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
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3
            className="min-w-0 flex-1 text-[13px] font-medium leading-5 line-clamp-2"
            style={{ color: roomMetaLabelColor }}
          >
            {room.room_code && (
              <>
                <span>Mã: </span>
                <span className="font-semibold text-[15px]" style={{ color: roomMetaValueColor }}>
                  {room.room_code}
                </span>
                <span style={{ color: roomMetaDividerColor }}> | </span>
              </>
            )}

            <span>Dạng: </span>
            <span className="font-semibold" style={{ color: roomMetaValueColor }}>
              {room.room_type}
            </span>
          </h3>

          {updatedAt && (
            <div className="shrink-0 text-right text-[12px] font-semibold leading-5 text-[#F4E7D6]/90">
              Cập nhật: {formatTimeAgo(updatedAt)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0 text-[18px] font-semibold text-[#60A5FA]">
            {price ? Number(price).toLocaleString("vi-VN") + " đ" : "Liên hệ"}
          </div>

          {isAdmin ? (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={handleToggleStatus}
              title="Bấm để đổi trạng thái phòng"
              className={`${statusBadgeBaseClass} ${statusBadgeAdminClass} ${statusBadgeColorClass} transition-all duration-150 active:scale-95 ${
                updatingStatus ? "cursor-wait opacity-70" : "cursor-pointer hover:scale-105"
              }`}
            >
              {updatingStatus ? "Đang lưu" : isRoomAvailable ? "Còn Trống" : "Đã thuê"}
            </button>
          ) : (
            <span className={`${statusBadgeBaseClass} ${statusBadgeAnonClass} ${statusBadgeColorClass}`}>
              {isRoomAvailable ? "Còn Trống" : "Đã thuê"}
            </span>
          )}
        </div>
      </div>

      {/* ADDRESS + DESCRIPTION + SHARE */}
      <div className="px-3 pb-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold leading-6 line-clamp-2 drop-shadow-[0_1px_6px_rgba(255,255,255,0.25)]">
              📍{adminLevel === 1 || adminLevel === 2
                ? room.house_number
                  ? `${room.house_number} `
                  : ""
                : `${publicHouseNumber(room.house_number)} `}
              {address}
              {ward && `, P. ${ward}`}
              {district && `, ${district}`}

              <button
                type="button"
                onClick={handleCopyAddress}
                title={copiedAddress ? "Đã copy địa chỉ" : "Copy địa chỉ"}
                className="
                  !min-h-0 !h-[20px] !w-[20px]
                  ml-1 inline-flex align-[-2px]
                  items-center justify-center
                  rounded-[3px]
                  bg-white/10
                  text-white/75
                  backdrop-blur-[10px]
                  transition
                  hover:bg-white/20 hover:text-white
                  active:scale-90
                "
              >
                {copiedAddress ? (
                  <span className="text-[10px] leading-none text-green-300">✓</span>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[20px] w-[20px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="8" y="8" width="11" height="11" rx="2.5" />
                    <path d="M5 16V7.5A2.5 2.5 0 0 1 7.5 5H16" />
                  </svg>
                )}
              </button>
            </p>

            {room.description && (
         <div
            className="
              mt-1 max-w-full truncate
              text-[14px] font-semibold leading-5
              text-red-400
            "
            title={String(room.description).trim()}
          >
            {String(room.description).split(/\r?\n/)[0]?.trim()}
            {String(room.description).includes("\n") ? "..." : ""}
          </div>
        )}
         </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (safeAdminLevel === 1 || safeAdminLevel === 2) {
                openAdminShareModal(e);
                return;
              }

              handleShareRoom(e);

            }}
            className="
              shrink-0 inline-flex h-10 w-10 items-center justify-center
              rounded-full border border-white/20
              bg-black/35 backdrop-blur-[10px]
              shadow-[0_8px_24px_rgba(0,0,0,0.35)]
              hover:bg-black/80 transition
            "
            title="Chia sẻ"
            aria-label="Chia sẻ"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.1 15.4 17" />
              <path d="M15.4 7 8.6 10.9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Link>

    {(safeAdminLevel === 1 || safeAdminLevel === 2) && (
     <ShareRoomModal
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      room={shareRoomData}
      images={shareImages}
      videos={shareVideos}
      roomUrl={href}
      adminLevel={safeAdminLevel}
      detail={
        shareRoomData?.room_detail ??
        shareRoomData?.room_details ??
        shareRoomData?.detail ??
        shareRoomData?.details ??
        shareRoomData
      }
    />
      )}

    {/* STATUS CONFIRM MODAL */}
    {confirmStatus &&
      typeof window !== "undefined" &&
      createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[4px]"
          onClick={() => setConfirmStatus(null)}
        >
          <div
            className="
              w-full max-w-[340px] rounded-[24px]
              border border-white/20
              bg-[linear-gradient(180deg,rgba(35,35,40,0.96),rgba(18,18,22,0.96))]
              p-5 text-white
              shadow-[0_30px_90px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.12)]
              backdrop-blur-[28px]
            "
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-[17px] font-bold">
              Xác nhận đổi trạng thái
            </div>

            <div className="text-sm leading-6 text-white/70">
              Bạn muốn đổi trạng thái phòng này từ{" "}
              <span className="font-bold text-white">
                {confirmStatus.prevStatus}
              </span>{" "}
              sang{" "}
              <span
                className={
                  confirmStatus.nextStatus === "Trống"
                    ? "font-bold text-green-300"
                    : "font-bold text-red-300"
                }
              >
                {confirmStatus.nextStatus}
              </span>
              ?
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmStatus(null)}
                className="
                  rounded-2xl border border-white/15
                  bg-white/10 px-4 py-2
                  text-sm font-semibold text-white/80
                  transition hover:bg-white/15 active:scale-95
                "
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={updatingStatus}
                onClick={confirmToggleStatus}
                className="
                  rounded-2xl border border-blue-400/40
                  bg-blue-600 px-4 py-2
                  text-sm font-bold text-white
                  shadow-[0_0_18px_rgba(37,99,235,0.45)]
                  transition hover:bg-blue-500 active:scale-95
                  disabled:cursor-wait disabled:opacity-60
                "
              >
                {updatingStatus ? "Đang lưu..." : "OK"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

   {/* ADMIN MODAL */}
    {adminPhone &&
      typeof window !== "undefined" &&
      createPortal(
        <div
          className="
            fixed inset-0 z-[2147483647]
            flex items-center justify-center
            bg-black/50
            backdrop-blur-[6px]
          "
          onClick={() => setAdminPhone(null)}
        >
          <div
            className="
              relative
              w-[88%]
              max-w-[250px]
              rounded-[20px]

              bg-[linear-gradient(180deg,rgba(249,236,213,0.72),rgba(218,196,166,0.68))]
              backdrop-blur-[42px]
              backdrop-saturate-[180%]

              border
              border-white/70

              shadow-[0_30px_80px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-1px_0_rgba(255,255,255,0.25)]

              p-4

              animate-[fadeIn_0.2s_ease]

              before:absolute
              before:inset-0
              before:rounded-[20px]
              before:bg-[linear-gradient(120deg,rgba(255,255,255,0.55),transparent_42%)]
              before:opacity-45
              before:pointer-events-none
            "
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative z-10 mb-3 mt-1 text-center">
              {contactName && (
                <div
                  className="
                    text-[15px]
                    font-bold
                    text-[#34271d]
                    drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]
                  "
                >
                  {contactName}
                </div>
              )}

              <div
                className="
                  mt-1
                  text-[13px]
                  font-semibold
                  tracking-[0.04em]
                  text-[#4a392b]
                  drop-shadow-[0_1px_1px_rgba(255,255,255,0.65)]
                "
              >
                {adminPhone.replace(
                  /(\d{4})(\d{3})(\d{3})/,
                  "$1 $2 $3"
                )}
              </div>
            </div>

            <div className="relative z-10 flex flex-col gap-2">
              <a
                href={`tel:${adminPhone}`}
                className="
                  w-full
                  rounded-xl

                  border
                  border-white/70

                  bg-[rgba(250,244,234,0.88)]

                  py-3

                  text-center
                  text-[16px]
                  font-bold
                  text-[#2f241b]

                  backdrop-blur-[18px]

                  shadow-[0_5px_14px_rgba(45,32,20,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]

                  transition
                  duration-150

                  hover:bg-[rgba(255,250,241,0.96)]
                  active:scale-[0.98]
                "
              >
                <span className="flex items-center justify-center gap-2 leading-none">
                  <span className="text-[18px]">📞</span>
                  <span>Gọi điện</span>
                </span>
              </a>

              <a
                href={`https://zalo.me/${adminPhone}`}
                target="_blank"
                rel="noreferrer"
                className="
                  w-full
                  rounded-xl

                  border
                  border-white/70

                  bg-[rgba(247,237,221,0.9)]

                  py-3

                  text-center
                  text-[16px]
                  font-bold
                  text-[#2f241b]

                  backdrop-blur-[18px]

                  shadow-[0_5px_14px_rgba(45,32,20,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]

                  transition
                  duration-150

                  hover:bg-[rgba(255,248,236,0.98)]
                  active:scale-[0.98]
                "
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