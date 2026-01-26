import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function pickCoverUrl(rows?: any[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  // ưu tiên is_cover
  const cover = rows.find((r) => r && r.is_cover && r.url);
  if (cover?.url) return cover.url;

  // fallback: row đầu tiên đã được order sẵn từ query
  const first = rows.find((r) => r && r.url);
  return first?.url || "";
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
  process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.vercel.app";

// ✅ mặc định (trước khi query DB)
let title = "Chi tiết phòng";
let desc = "Xem chi tiết phòng";

  let image = absUrl(base, "/hero.jpg"); // fallback
  const url = `${base.replace(/\/$/, "")}/rooms/${encodeURIComponent(id)}`;

  try {
    const supabase = createSupabaseAdminClient();
const { data } = await supabase
  .from("rooms")
  .select("room_code, room_type, price, address, ward, district, house_number")
  .eq("id", id)
  .maybeSingle();

const roomCode = (data as any)?.room_code ?? "";
const roomType = (data as any)?.room_type ?? "";
const price = (data as any)?.price;

// ✅ nếu không có room -> giữ fallback title/desc + image và thoát try
if (!data) throw new Error("room_not_found");

// ✅ 1) Ưu tiên thumb.webp theo convention R2: rooms/room-{room_code}/images/thumb.webp
const R2_BASE = (process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "")
  .toString()
  .replace(/\/$/, "");

const safeRoomCode =
  String(roomCode || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "") || "";

const thumb = R2_BASE && safeRoomCode
  ? `${R2_BASE}/rooms/room-${safeRoomCode}/images/thumb.webp`
  : "";

if (thumb) {
  image = absUrl(base, thumb);
} else {
  // ✅ 2) fallback cũ: lấy cover từ room_media
  const { data: mediaRows } = await supabase
    .from("room_media")
    .select("url,is_cover,created_at")
    .eq("room_id", id)
    .eq("type", "image")
    .order("created_at", { ascending: true });

  const img = pickCoverUrl(mediaRows as any[]);
  if (img) image = absUrl(base, img);
}

    // ✅ Title preview theo format bạn yêu cầu
  const codeLabel = roomCode ? String(roomCode) : "—";
  const typeLabel = roomType ? String(roomType) : "Phòng";
  title = `Mã: ${codeLabel} | Dạng: ${typeLabel}`;

    // ✅ Description = địa chỉ KHÔNG có số nhà
    const addr = [
      (data as any)?.address,
      (data as any)?.ward ? `P. ${(data as any).ward}` : "",
      (data as any)?.district,
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(", ");

    if (addr) {
      desc = addr;
    }

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
