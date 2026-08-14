import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SalesPortalView from "@/components/sales/SalesPortalView";
import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await getSalesPortalData(token);
  if (!data) return { title: "Thông tin Sale", robots: { index: false, follow: false } };

  const title = `Tình trạng phòng trống - ${data.property.name}`;
  const description = `Link cập nhật tình trạng phòng trống Tòa nhà: ${data.property.full_address}`;
  const image = data.property.cover_image || data.property.gallery_images[0] || data.rooms.flatMap((room) => room.media).find((media) => media.type === "image")?.url;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", images: image ? [{ url: image }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function SalesPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSalesPortalData(token);
  if (!data) notFound();
  return <SalesPortalView data={data} />;
}
