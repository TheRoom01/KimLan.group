import Link from "next/link";

import PropertyCard from "@/components/owner/PropertyCard";
import { getProperties } from "@/lib/owner/getProperties";
import PropertyJoinRequestPanel from "@/components/owner/PropertyJoinRequestPanel";
import PropertyListToolbar, { type PropertyOccupancyFilter } from "@/components/owner/PropertyListToolbar";
import { Building2, Plus } from "lucide-react";

function normalizeSearchValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function propertySearchScore(property: Awaited<ReturnType<typeof getProperties>>[number], query: string) {
  const address = normalizeSearchValue([property.house_number, property.address, property.ward, property.district, property.city].filter(Boolean).join(" "));
  const code = normalizeSearchValue(String(property.code ?? ""));
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => address.includes(token) || code.includes(token))) return null;
  let score = address === query ? 10_000 : 0;
  if (address.startsWith(query)) score += 5_000;
  const phraseIndex = address.indexOf(query);
  if (phraseIndex >= 0) score += 3_000 - Math.min(phraseIndex, 1_000);
  for (const token of tokens) {
    score += address.split(" ").includes(token) ? 300 : 150;
    if (code === token) score += 250;
  }
  return score + Math.max(0, 500 - Math.abs(address.length - query.length));
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ building_search?: string; occupancy?: string }> }) {
  const properties = await getProperties();
  const { building_search: searchTerm = "", occupancy } = await searchParams;
  const occupancyFilter: PropertyOccupancyFilter | null = occupancy === "empty" || occupancy === "full" ? occupancy : null;
  const normalizedQuery = normalizeSearchValue(searchTerm);
  const rankedProperties = normalizedQuery ? properties.map((property) => ({ property, score: propertySearchScore(property, normalizedQuery) })).filter((item): item is { property: (typeof properties)[number]; score: number } => item.score !== null).sort((left, right) => right.score - left.score).map((item) => item.property) : properties;
  const visibleProperties = rankedProperties.filter((property) => {
    if (occupancyFilter === "empty") return Number(property.empty_rooms ?? 0) > 0;
    if (occupancyFilter === "full") return Number(property.total_rooms ?? 0) > 0 && Number(property.empty_rooms ?? 0) === 0;
    return true;
  });
  const hasListFilter = Boolean(normalizedQuery || occupancyFilter);

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Building2
              size={28}
              strokeWidth={1.8}
              className="shrink-0 text-[#744722]"
            />

            <h1 className="text-2xl font-bold text-[#432918] sm:text-3xl">
              Danh sách tòa nhà
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#7f6651]">
            {hasListFilter ? `Hiển thị ${visibleProperties.length}/${properties.length} tòa nhà` : `Tổng cộng: ${properties.length} tài sản bạn có quyền truy cập`}
          </p>
        </div>

        <Link
          href="/owner/properties/create"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817] sm:w-auto"
        >
          <Plus size={17} />
          Thêm tòa nhà
        </Link>
      </div>
      
      <PropertyJoinRequestPanel />

      <PropertyListToolbar key={`${searchTerm}:${occupancyFilter ?? "all"}`} initialSearch={searchTerm} activeFilter={occupancyFilter} />

      {visibleProperties.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center">
          <h2 className="text-lg font-bold text-[#4d3422]">{hasListFilter ? "Không tìm thấy tòa nhà phù hợp" : "Chưa có tòa nhà"}</h2>
          <p className="mt-2 text-sm text-[#80634a]">
            {hasListFilter ? "Không có tòa nhà nào khớp với từ khóa và bộ lọc hiện tại. Hãy thử đổi điều kiện tìm kiếm." : "Tạo tài sản mới hoặc tham gia quản lý tòa nhà được chia sẻ bởi chủ sở hữu khác."}
          </p>
          {!hasListFilter ? <Link
            href="/owner/properties/create"
            className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb]"
          >
            Tạo tòa nhà đầu tiên
          </Link> : null}
        </div>
      ) : (
        <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
