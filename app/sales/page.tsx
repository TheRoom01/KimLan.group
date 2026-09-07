import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";
import { collectionPath, parseCollectionTokens, salesBuildingKey, findSalesBuilding } from "@/lib/sales-portal/collection";
import SalesPortalView from "@/components/sales/SalesPortalView";
import { getCollectionTokens } from "@/lib/sales-portal/getCollectionTokens";
import SalesBuildingGrid from "@/components/sales/SalesBuildingGrid";

export const dynamic = "force-dynamic";
const shareTitle = "Cập nhật phòng trống Hệ thống căn hộ";
export const metadata: Metadata = {
  title: { absolute: shareTitle },
  openGraph: {
    title: shareTitle,
    type: "website",
    images: [{ url: "/og-logo.jpg", width: 1200, height: 630, alt: shareTitle }],
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    images: ["/og-logo.jpg"],
  },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SalesCollectionPage({ searchParams }: {
  searchParams: Promise<{ links?: string | string[]; collection?: string; building?: string }>;
}) {
  const query = await searchParams;
  const tokens = query.collection !== undefined ? await getCollectionTokens(query.collection) : parseCollectionTokens(query.links);
  const results = await Promise.all(tokens.map(async (token) => ({ token, data: await getSalesPortalData(token) })));
  const seen = new Set<string>();
  const buildings = results.filter((item) => {
    if (!item.data || seen.has(item.data.property.id)) return false;
    seen.add(item.data.property.id);
    return true;
  });
  const properties = buildings.flatMap((item) => item.data ? [item.data.property] : []);
  const selectedProperty = findSalesBuilding(properties, query.building);
  const selected = buildings.find((item) => item.data?.property.id === selectedProperty?.id);
  const path = query.collection !== undefined ? `/sales?collection=${encodeURIComponent(query.collection)}` : collectionPath(tokens);
  const buildingPath = (key: string) => `/sales?building=${encodeURIComponent(key)}&${path.split("?")[1]}`;
  if (selectedProperty && (query.building !== salesBuildingKey(selectedProperty, properties) || Object.keys(query)[0] !== "building")) {
    redirect(buildingPath(salesBuildingKey(selectedProperty, properties)));
  }
  if (selected?.data) return <>
    <nav className="bg-[#fffaf6] px-6 py-3 text-sm font-semibold text-[#744722]"><Link href={path}>← Tất cả tòa nhà</Link></nav>
    <SalesPortalView data={selected.data} />
  </>;

  return <main className="min-h-screen bg-[#fffaf6] px-4 py-8 text-[#432918] sm:px-8">
    <section className="mx-auto max-w-[1112px]">
      <p className="text-xs font-bold uppercase tracking-widest text-[#9c5429]">Tòa nhà</p>
      <h1 className="mt-4 text-2xl font-bold sm:text-[28px]">Chọn tòa nhà để xem phòng trống</h1>
      <p className="mt-2 text-sm text-[#80634a]">Bấm vào một tòa nhà để xem tình trạng phòng và thông tin dành cho Sale.</p>
      {buildings.length ? <SalesBuildingGrid buildings={buildings.flatMap(({ data }) => data ? [{
        id: data.property.id,
        href: buildingPath(salesBuildingKey(data.property, properties)),
        image: data.property.cover_image || data.property.gallery_images[0] || null,
        name: data.property.name,
        title: data.property.code || data.property.name,
        address: data.property.full_address || data.property.name,
        roomCount: data.rooms.length,
        availableCount: data.summary["Trống"],
        upcomingCount: data.summary["Sắp trống"],
      }] : [])} /> : <p className="mt-8 rounded-2xl border border-dashed border-[#d9bd99] bg-white p-8 text-center text-sm text-[#80634a]">Không có tòa nhà được chia sẻ hoặc link đã hết hạn, bị thu hồi. Vui lòng liên hệ chủ nhà để nhận link mới.</p>}
    </section>
  </main>;
}
