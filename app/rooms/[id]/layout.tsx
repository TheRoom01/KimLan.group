import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function firstImage(gallery: any, media?: any): string {
  // 1) ưu tiên gallery_urls (csv string)
  const s = String(gallery || "").trim();
  if (s) {
    const g = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)[0];
    if (g) return g;
  }

  // 2) fallback: lấy ảnh đầu tiên từ media
  if (Array.isArray(media)) {
    const img = media.find(
      (m) => m && (m.type === "image" || m.kind === "image") && m.url
    );
    if (img?.url) return img.url;
  }

  return "";
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
  params: { id: string };
}): Promise<Metadata> {
  const id = params?.id || "";
  const base =
    process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.vercel.app";

  let title = "Chi tiết phòng";
  let desc = "Xem chi tiết phòng";
  let image = absUrl(base, "/hero.jpg"); // fallback
  const url = `${base.replace(/\/$/, "")}/rooms/${encodeURIComponent(id)}`;

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
        .from("rooms")
        .select(
            "room_code, room_type, price, address, ward, district, house_number, gallery_urls, media"
        )
        .eq("id", id)
        .maybeSingle();


    const roomCode = (data as any)?.room_code ?? "";
    const roomType = (data as any)?.room_type ?? "";
    const price = (data as any)?.price;

    const img = firstImage(
    (data as any)?.gallery_urls,
    (data as any)?.media
    );
    if (img) image = absUrl(base, img);


    title = roomCode ? `Phòng ${roomCode}` : title;
    if (roomType) title = `${title} - ${roomType}`;
    if (typeof price === "number")
      title = `${title} - ${price.toLocaleString("vi-VN")} đ`;

    const addr = [
      (data as any)?.house_number,
      (data as any)?.address,
      (data as any)?.ward ? `P. ${(data as any).ward}` : "",
      (data as any)?.district,
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(", ");

    if (addr) desc = addr;
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
