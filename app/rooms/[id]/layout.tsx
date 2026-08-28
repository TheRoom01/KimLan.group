import type { Metadata } from "next";
import { getPublicRoomDetail } from "@/lib/rooms/publicCache";

export const dynamic = "force-dynamic";

type MetadataMedia = {
  type?: unknown;
  url?: unknown;
  is_cover?: unknown;
};

type PublicRoomMetadata = {
  room_code?: unknown;
  room_type?: unknown;
  price?: unknown;
  address?: unknown;
  ward?: unknown;
  district?: unknown;
  media?: MetadataMedia[] | null;
};

function pickCoverUrl(rows?: MetadataMedia[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  // ưu tiên is_cover
  const cover = rows.find((r) => r && r.is_cover && r.url);
  if (cover?.url) return String(cover.url);

  // fallback: row đầu tiên đã được order sẵn từ query
  const first = rows.find((r) => r && r.url);
  return first?.url ? String(first.url) : "";
}

function absUrl(base: string, u: string) {
  const x = String(u || "").trim();
  if (!x) return "";
  if (x.startsWith("http://") || x.startsWith("https://")) return x;
  return base.replace(/\/$/, "") + (x.startsWith("/") ? x : `/${x}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

const base =
  process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.pro";

// ✅ mặc định (trước khi query DB)
let title = "The Room SG";
let desc = "Xem chi tiết phòng";

  let image = absUrl(base, "/hero.jpg"); // fallback
  const url = `${base.replace(/\/$/, "")}/rooms/${encodeURIComponent(id)}`;

  try {
const data = (await getPublicRoomDetail(id)) as PublicRoomMetadata | null;

const roomCode = data?.room_code ?? "";
const roomType = data?.room_type ?? "";
const price = data?.price;

// ✅ nếu không có room -> giữ fallback title/desc + image và thoát try
if (!data) throw new Error("room_not_found");

// ✅ 1) Ưu tiên thumb.webp theo convention R2 chuẩn UUID: rooms/{id}/images/thumb.webp
const R2_BASE = (process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "")
  .toString()
  .replace(/\/$/, "");

const thumb = R2_BASE && id
  ? `${R2_BASE}/rooms/${encodeURIComponent(id)}/images/thumb.webp`
  : "";

if (thumb) {
  image = absUrl(base, thumb);
} else {
  // Fallback dùng chính payload detail đã cache, không tạo thêm query media.
  const mediaRows = Array.isArray(data.media)
    ? data.media.filter(
        (item) => String(item?.type ?? "").toLowerCase() === "image",
      )
    : [];
  const img = pickCoverUrl(mediaRows);
  if (img) image = absUrl(base, img);
}

    // ✅ Title preview theo format bạn yêu cầu
  const formatVND = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("vi-VN")} đ` : "";
};

const rawWard = String(data.ward || "").trim().replace(/^P\.?\s*/i, "");
const wardLabel = rawWard ? (/^\d+$/.test(rawWard) ? `P.${rawWard}` : `P. ${rawWard}`) : "";

const addr = [
  data.address,
  wardLabel,
  data.district,
]
  .map((x) => String(x || "").trim())
  .filter(Boolean)
  .join(", ");

const priceLabel = formatVND(price);
const typeLabel = roomType ? String(roomType).trim() : "";
const codeLabel = roomCode ? String(roomCode).trim() : "";

// Dòng đậm khi share: ưu tiên địa chỉ
title = addr || "Chi tiết phòng";

// Dòng mô tả: ưu tiên giá, rồi thêm loại phòng + mã phòng
desc = [
  priceLabel,
  typeLabel,
  codeLabel ? `Mã ${codeLabel}` : "",
]
  .filter(Boolean)
  .join(" • ");

  } catch {
    // fail-open
  }

  return {
    metadataBase: new URL(base),
    title,
    description: desc,
    openGraph: {
      type: "website",
      url,
      title,
      description: desc,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [image],
    },
  };
}

export default function RoomsIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
