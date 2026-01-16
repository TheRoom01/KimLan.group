"use client";

import Link from "next/link";
import Image from "next/image";

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
  gallery_urls: string | null;
  has_video?: boolean;
};

function formatWardToP(input?: string | null) {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  // Nếu user đã nhập "P.1", "p1", "p. 2" → chuẩn hoá
  const noPrefix = raw.replace(/^p\.?\s*/i, "").trim();

  // Nếu user nhập "Phường 1" → bỏ "Phường" rồi lấy phần còn lại
  const noPhuong = noPrefix.replace(/^phường\s+/i, "").trim();

  // Luôn hiển thị P.<...> cho cả chữ lẫn số
  return `P.${noPhuong}`;
}

export default function RoomCard(props: { room: Room; adminLevel: number; index?: number }) {

  const { room, adminLevel, index = 0 } = props;
    const images = room.gallery_urls
    ? room.gallery_urls.split(",").map((i) => i.trim()).filter(Boolean)
    : [];
  
  const showImages = images.slice(0, 3);

  const safeSrc = (src?: string | null) => {
  const s = (src ?? "").trim();
      return s ? s : "/no-image.png";
    };

const mainImage = safeSrc(images[0]);
const subImage1 = safeSrc(showImages[1]);
const subImage2 = safeSrc(showImages[2]);

  const title =
  room.room_code ??
  room.room_type ??
  "Phòng cho thuê";

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
// ===== IMAGE SOURCE (from gallery_urls) =====


    return (
    <Link href={`/rooms/${room.id}`} scroll={false} className="block">
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
    src={mainImage}
    alt={room.room_type ?? "Hình phòng"}
    fill
    sizes="(max-width: 1024px) 100vw, 60vw"
    className="object-cover object-[50%_40%]"
    priority={index < 6}
    loading={index < 6 ? "eager" : "lazy"}
    unoptimized
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
      src={subImage1}
      alt={room.room_code ? `Hình phòng ${room.room_code}` : "Hình phòng"}
      fill
      sizes="(max-width: 1024px) 100vw, 40vw"
      className="object-cover"
      unoptimized
    />
  </div>
  )}
     {/* Ảnh phụ 2 + overlay */}
      {showImages[2] && (
    <div className="relative w-full h-full">
    <Image
      src={subImage2}
      alt={room.room_type}
      fill
      sizes="(max-width: 1024px) 100vw, 40vw"
      className="object-cover"
      unoptimized
    />
      <div className="absolute inset-0 bg-black/30" />

        {images.length > 3 && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-lg font-semibold">
         +{images.length - 3}
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
            <h3 className="text-[15px] font-medium text-gray-600 leading-6">
              {[
                room.room_code ? `Mã: ${room.room_code}` : null,
                room.room_type,
              ]
                .filter(Boolean)
                .join(" | ")}
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
<div className="flex flex-wrap items-start gap-3">
  <div className="text-[16px] font-semibold text-sky-600 leading-6">
    Giá: {price ? Number(price).toLocaleString("vi-VN") + " đ" : "Liên hệ"}
  </div>

  {room.description ? (
    <div className="w-full text-[13px] text-gray-800 whitespace-pre-line break-words line-clamp-2">
      {room.description}
    </div>
  ) : null}
</div>


          {/* Dòng 3: Địa chỉ */}
          <p className="text-gray-800 font-semibold leading-6 pb-3">
            📍 {isAdmin && room.house_number && `${room.house_number} `}
               {address}
               {ward && `, ${formatWardToP(ward)}`}
               {district && `, ${district}`}
          </p>
        </div>
        </div>
        </Link>
    );
  }