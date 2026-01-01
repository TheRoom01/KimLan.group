"use client";

import Link from "next/link";

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
};

export default function RoomCard(props: { room: Room; adminLevel: number }) {
  const { room, adminLevel } = props;

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

  const images = room.gallery_urls
    ? room.gallery_urls.split(",").map((i) => i.trim())
    : [];

  const showImages = images.slice(0, 3);

 const level = Number(adminLevel) || 0;
const isAdmin = level === 1 || level === 2;
// ===== IMAGE SOURCE (from gallery_urls) =====
const gallery = (() => {
  const v: any = room.gallery_urls;

  if (!v) return [];

  if (Array.isArray(v)) return v.filter(Boolean);

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return s.startsWith("http") ? [s] : [];
    }
  }

  return [];
})();

const mainImage = gallery[0] || "/no-image.png";

    return (
    <Link href={`/rooms/${room.id}`} className="block">
      {/* CARD */}
      <div
        className="group rounded-xl border bg-white overflow-hidden
                   transition hover:shadow-xl"
      >
        {/* ================= IMAGE SECTION ================= */}
        <div className="h-[240px] overflow-hidden">
          <div className="grid grid-cols-[60%_40%] gap-1 h-full">
            {/* Ảnh chính */}
            <img
              src={showImages?.[0] || "/no-image.png"}
              alt={room.room_type}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/no-image.png";
              }}
            />

            {/* Ảnh phụ */}
            <div className="grid grid-rows-2 gap-1 relative h-full">
              {/* Ảnh phụ 1 */}
              {showImages[1] && (
                <img
                  src={showImages[1]}
                  alt={room.room_type}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/no-image.png";
                  }}
                />
              )}

              {/* Ảnh phụ 2 + overlay */}
              {showImages[2] && (
                <div className="relative w-full h-full">
                  <img
                    src={showImages[2]}
                    alt={room.room_type}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/no-image.png";
                    }}
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
          <div className="flex items-start justify-between gap-3">
            <div className="text-[16px] font-semibold text-sky-600 leading-6">
              Giá: {price ? Number(price).toLocaleString("vi-VN") + " đ" : "Liên hệ"}
            </div>

            {room.description ? (
              <div className="text-[13px] text-gray-800 text-right whitespace-pre-line line-clamp-2">
                {room.description}
              </div>
            ) : null}
          </div>
                     </div>

          {/* Dòng 3: Địa chỉ */}
          <p className="text-gray-800 font-semibold leading-6 pb-3">
            📍 {isAdmin && room.house_number && `${room.house_number} `}
               {address}
               {ward && `, ${ward}`}
               {district && `, ${district}`}
          </p>
        </div>
        </Link>
    );
  }