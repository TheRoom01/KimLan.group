import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function firstImage(gallery: any): string {
  const s = String(gallery || "").trim();
  if (!s) return "";
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)[0] || "";
}

function absUrl(base: string, u: string) {
  const x = String(u || "").trim();
  if (!x) return "";
  if (x.startsWith("http://") || x.startsWith("https://")) return x;
  return base.replace(/\/$/, "") + (x.startsWith("/") ? x : `/${x}`);
}

export default async function Head({ params }: { params: { id: string } }) {
  const id = params?.id || "";
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.vercel.app";

  let title = "Chi tiết phòng";
  let desc = "Xem chi tiết phòng";
  let image = absUrl(base, "/hero.jpg"); // fallback
  const url = `${base.replace(/\/$/, "")}/rooms/${encodeURIComponent(id)}`;

  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("rooms")
      .select("room_code, room_type, price, address, ward, district, house_number, gallery_urls")
      .eq("id", id)
      .maybeSingle();

    const roomCode = (data as any)?.room_code ?? "";
    const roomType = (data as any)?.room_type ?? "";
    const price = (data as any)?.price;

    const img = firstImage((data as any)?.gallery_urls);
    if (img) image = absUrl(base, img);

    title = roomCode ? `Phòng ${roomCode}` : title;
    if (roomType) title = `${title} - ${roomType}`;
    if (typeof price === "number") title = `${title} - ${price.toLocaleString("vi-VN")} đ`;

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

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={desc} />

      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />
    </>
  );
}
