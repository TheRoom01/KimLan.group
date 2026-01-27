"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";


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

  image_urls?: string[] | null;   // 3 ảnh đầu, đúng thứ tự admin up
  image_count?: number | null;    // tổng ảnh để hiện +N đúng

  has_video?: boolean;
};

export default function RoomCard(props: { room: Room; adminLevel: number; index?: number }) {
  const { room, adminLevel, index = 0 } = props;

   const images = Array.isArray(room.image_urls)
    ? room.image_urls.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const showImages = images.slice(0, 3);

  const FALLBACK = "/no-image.png";

  const safeSrc = (src?: string | null) => {
    const s = (src ?? "").trim();
    return s ? s : FALLBACK;
  };

  // ✅ build thumb.webp theo convention bạn đang dùng:
  // rooms/{room_id}/images/thumb.webp  với room_id = `room-${safeRoomCode}`
  const R2_BASE =
    (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
      "")?.replace(/\/$/, "") || "";

  const safeRoomCode =
    String(room.room_code || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9-_]/g, "") || "";

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
    R2_BASE && safeRoomCode
      ? `${R2_BASE}/rooms/room-${safeRoomCode}/images/thumb.webp?v=${encodeURIComponent(
          thumbBust
        )}`
      : "";

// ✅ main ưu tiên thumb.webp, fallback qua ảnh đầu
// Nếu không có media thật => dùng FALLBACK (không lấy thumb.webp)
const mainPreferred = hasRealMedia
  ? safeSrc((thumbUrl || showImages[0]) ?? "")
  : FALLBACK;

const subImage1 = safeSrc(showImages[1] ?? "");
const subImage2 = safeSrc(showImages[2] ?? "");

// ✅ mainErrorStage:
// 0: đang dùng thumb (nếu có và có media thật)
// 1: fallback sang ảnh đầu
// 2: fallback no-image
const [mainErrorStage, setMainErrorStage] = useState<0 | 1 | 2>(0);
const [sub1Ok, setSub1Ok] = useState(true);
const [sub2Ok, setSub2Ok] = useState(true);

// fallback sang ảnh đầu (chỉ có ý nghĩa khi showImages[0] tồn tại)
const mainFallback1 = safeSrc(showImages[0] ?? "");

// chọn main src theo stage
const mainSrc =
  mainErrorStage === 0
    ? mainPreferred
    : mainErrorStage === 1
    ? mainFallback1
    : FALLBACK;

const sub1Src = sub1Ok ? subImage1 : FALLBACK;
const sub2Src = sub2Ok ? subImage2 : FALLBACK;

const title = room.room_code ?? room.room_type ?? "Phòng cho thuê";


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


 const level = Number(adminLevel) || 0;
const isAdmin = level === 1 || level === 2;
// ===== IMAGE SOURCE (from room_media via image_urls) =====

    return (
    <Link href={`/rooms/${room.id}`} className="block">
      {/* CARD */}
      <div
        className="group rounded-xl border bg-white overflow-hidden
                   transition hover:shadow-xl"
      >
        {/* ================= IMAGE SECTION ================= */}
   <div className="h-[240px] overflow-hidden bg-gray-100">
   <div className="grid grid-cols-[60%_40%] gap-1 h-full">
    
    {/* Ảnh chính */}
    <div className="relative w-full h-full overflow-hidden">
  <Image
  src={mainSrc}
  alt={room.room_type ?? "Hình phòng"}
  fill
  sizes="(max-width: 1024px) 100vw, 60vw"
  className="object-cover object-[50%_40%]"
  priority={index < 6}
  loading={index < 6 ? "eager" : "lazy"}
  unoptimized
  onError={() => setMainErrorStage((s) => (s < 2 ? ((s + 1) as any) : 2))}

/>


  {room.has_video && (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="bg-black/50 text-white text-2xl rounded-full w-12 h-12 flex items-center justify-center">
        ▶
      </div>
    </div>
  )}
  </div>

           
 {/* Ảnh phụ */}
      <div className="grid grid-rows-2 gap-1 relative h-full">
    {/* Ảnh phụ 1 */}
      {showImages[1] && (
  <div className="relative w-full h-full overflow-hidden">
    <Image
      src={sub1Src}
      alt={room.room_code ? `Hình phòng ${room.room_code}` : "Hình phòng"}
      fill
      sizes="(max-width: 1024px) 100vw, 40vw"
      className="object-cover"
      unoptimized
      onError={() => setSub1Ok(false)}
    />

  </div>
  )}
     {/* Ảnh phụ 2 + overlay */}
      {showImages[2] && (
    <div className="relative w-full h-full">
    <Image
      src={sub2Src}
      alt={room.room_type}
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
        
  {/* ================= INFO SECTION ================= */}
    <div className="p-3 flex flex-col gap-2">
     {/* Dòng 1 */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-medium text-gray-500 leading-6">
              {room.room_code ? (
                <>
                  <span>Mã: </span>
                  <span className="font-semibold text-gray-800">{room.room_code}</span>
                  <span> | </span>
                </>
              ) : null}
              <span>Dạng: </span>
              <span className="font-semibold text-gray-800">{room.room_type}</span>
            </h3>

            <span
              className={`text-xs px-2 py-[2px] rounded-full whitespace-nowrap ${
                room.status === "Trống"
                  ? "bg-green-500 text-white"
                  : "bg-gray-300 text-gray-700"
              }`}
            >
              {room.status === "Trống" ? "Còn Trống" : "Đã thuê"}
            </span>
          </div>

      {/* Dòng 2: Giá (trái) + description (phải, ngay dưới badge) */}
          <div className="flex items-start gap-3">
        <div className="shrink-0 whitespace-nowrap text-[16px] font-semibold text-sky-600 leading-6">
          Giá: {price ? Number(price).toLocaleString("vi-VN") + " đ" : "Liên hệ"}
        </div>

        {room.description ? (
          <div className="flex-1 text-[14px] text-gray-800 text-right break-words whitespace-pre-line line-clamp-2">
            {room.description}
          </div>
        ) : null}
        </div>
       </div>

    {/* Dòng 3: Địa chỉ */}
       <p className="text-gray-800 font-semibold leading-6 pb-3">
          📍 {isAdmin && room.house_number && `${room.house_number} `}
            {address}
            {ward && `, P. ${ward}`}
            {district && `, ${district}`}
        </p>

        </div>
        </Link>
    );
  }