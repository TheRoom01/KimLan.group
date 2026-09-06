import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";
import { collectionPath, parseCollectionTokens, salesBuildingKey, findSalesBuilding } from "@/lib/sales-portal/collection";
import SalesPortalView from "@/components/sales/SalesPortalView";
import { getCollectionTokens } from "@/lib/sales-portal/getCollectionTokens";

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
      {buildings.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {buildings.map(({ data }) => {
          if (!data) return null;
          const hero = data.property.cover_image || data.property.gallery_images[0];
          return <Link key={data.property.id} href={buildingPath(salesBuildingKey(data.property, properties))} className="group overflow-hidden rounded-2xl border border-[#e8d9cb] bg-white shadow-[0_8px_24px_rgba(92,61,34,0.06)] transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#744722]">
            <div className="relative h-[152px] bg-[#eadfD3]">
              {hero ? <img src={hero} alt={data.property.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#9a7758]"><Building2 size={48} /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <h2 className="absolute inset-x-4 bottom-4 text-lg font-bold text-white">{data.property.code || data.property.name}</h2>
            </div>
            <div className="p-4">
              <p className="min-h-12 text-sm leading-6 text-[#80634a]">{data.property.full_address || data.property.name}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"><span><strong>{data.rooms.length}</strong> phòng</span><span><strong>{data.summary["Trống"]}</strong> trống hôm nay</span><span><strong>{data.summary["Sắp trống"]}</strong> sắp trống</span></div>
              <span className="mt-4 inline-flex rounded-full bg-[#e7f2eb] px-3 py-1 text-xs font-bold text-[#386658]">↗ Xem phòng trống</span>
            </div>
          </Link>;
        })}
      </div> : <p className="mt-8 rounded-2xl border border-dashed border-[#d9bd99] bg-white p-8 text-center text-sm text-[#80634a]">Không có tòa nhà được chia sẻ hoặc link đã hết hạn, bị thu hồi. Vui lòng liên hệ chủ nhà để nhận link mới.</p>}
    </section>
  </main>;
}
