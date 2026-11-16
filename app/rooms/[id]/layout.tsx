import type { Metadata } from "next";
import { getFullImageUrls } from "@/lib/rooms/cardImages";
import { getRoomDetailForRender } from "@/lib/rooms/publicCache";
import { defaultShareImage, siteUrl } from "@/lib/default-share-image";

export const dynamic = "force-dynamic";

type PublicRoomMetadata = {
  room_code?: unknown;
  room_type?: unknown;
  price?: unknown;
  address?: unknown;
  ward?: unknown;
  district?: unknown;
} & Parameters<typeof getFullImageUrls>[0];

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

const base = siteUrl.origin;

// ✅ mặc định (trước khi query DB)
let title = "The Room SG";
let desc = "Xem chi tiết phòng";

  let image = "";
  const url = `${base.replace(/\/$/, "")}/rooms/${encodeURIComponent(id)}`;

  try {
const detail = await getRoomDetailForRender(id);
const data = detail.room as PublicRoomMetadata | null;

const roomCode = data?.room_code ?? "";
const roomType = data?.room_type ?? "";
const price = data?.price;

// ✅ nếu không có room -> giữ fallback title/desc + image và thoát try
if (!data) throw new Error("room_not_found");

const [firstImage] = getFullImageUrls(data);
if (firstImage) image = absUrl(base, firstImage);

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
      images: [image ? { url: image } : defaultShareImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [image || defaultShareImage],
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
