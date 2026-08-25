import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SalesPortalView from "@/components/sales/SalesPortalView";
import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";
import type { SalesPortalData } from "@/lib/sales-portal/types";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await getSalesPortalData(token);
  if (!data) return { title: "Thông tin Sale", robots: { index: false, follow: false } };

  const title = `Tình trạng phòng trống - ${data.property.name}`;
  const description = `Link cập nhật tình trạng phòng trống Tòa nhà: ${data.property.full_address}`;
  const image = `${publicSiteUrl()}/api/sales-og/${encodeURIComponent(token)}?v=${salesOgVersion(data)}`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1200, height: 630, alt: `Tình trạng phòng - ${data.property.name}` }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

function publicSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://www.canhodichvu.pro";
  try {
    const url = new URL(configured);
    if (url.hostname === "canhodichvu.pro") url.hostname = "www.canhodichvu.pro";
    return url.origin;
  } catch {
    return "https://www.canhodichvu.pro";
  }
}

function salesOgVersion(data: SalesPortalData) {
  const source = JSON.stringify({
    cover: data.property.cover_image || data.property.gallery_images[0] || "",
    address: data.property.full_address,
    documents: data.documents.map((document) => document.id),
    rooms: data.rooms.map((room) => [room.id, room.room_code, room.room_type, room.status]),
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export default async function SalesPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSalesPortalData(token);
  if (!data) notFound();
  return <SalesPortalView data={data} />;
}
