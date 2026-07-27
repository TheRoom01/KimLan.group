import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  Clock3,
  FileText,
  Home,
  KeyRound,
  Sparkles,
  TrendingUp,
  Warehouse,
} from "lucide-react";

import { getOwnerDashboard } from "@/lib/owner/getOwnerDashboard";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";

type DashboardContract = {
  id?: unknown;
  tenant?: unknown;
  room?: unknown;
  property?: unknown;
  monthly_price?: unknown;
  created_at?: unknown;
  end_date?: unknown;
};

type PropertyOverview = {
  id: string;
  name: string;
  total: number;
  rented: number;
  empty: number;
  upcoming: number;
  monthlyRevenue: number;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return null;
}

function firstRelation(value: unknown): unknown {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function relationLabel(
  value: unknown,
  fallback: string,
  preferredKeys: string[],
): string {
  const relation = firstRelation(value);
  const scalar = asString(relation);
  if (scalar) return scalar;

  if (relation && typeof relation === "object") {
    const record = relation as Record<string, unknown>;

    for (const key of preferredKeys) {
      const label = asString(record[key]);
      if (label) return label;
    }
  }

  return fallback;
}

function relationId(value: unknown): string | null {
  const relation = firstRelation(value);
  const scalar = asString(relation);
  if (scalar) return scalar;

  if (relation && typeof relation === "object") {
    return asString((relation as Record<string, unknown>).id);
  }

  return null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return "Chưa cập nhật";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";

  return date.toLocaleDateString("vi-VN");
}

function daysUntil(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;

  const target = new Date(`${raw}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function propertyDisplayName(propertyValue: unknown) {
  const property = firstRelation(propertyValue);
  const scalar = asString(property);
  if (scalar) return scalar;

  if (!property || typeof property !== "object") {
    return "Chưa gắn tòa nhà";
  }

  const record = property as Record<string, unknown>;
  const directName = asString(record.name);
  if (directName) return directName;

  const address = [
    asString(record.house_number),
    asString(record.address),
    asString(record.district),
  ]
    .filter(Boolean)
    .join(" ");

  return address || "Tòa nhà chưa đặt tên";
}

function buildPropertyOverview(rooms: unknown[]): PropertyOverview[] {
  const groups = new Map<string, PropertyOverview>();

  for (const candidate of rooms) {
    if (!candidate || typeof candidate !== "object") continue;

    const room = candidate as Record<string, unknown>;
    const property = firstRelation(room.property);
    const propertyId =
      relationId(property) || asString(room.property_id) || "unassigned";

    const current = groups.get(propertyId) ?? {
      id: propertyId,
      name: propertyDisplayName(property),
      total: 0,
      rented: 0,
      empty: 0,
      upcoming: 0,
      monthlyRevenue: 0,
    };

    current.total += 1;

    const displayStatus = asString(room.displayStatus);
    const contract = firstRelation(room.contract);
    const contractRecord =
      contract && typeof contract === "object"
        ? (contract as Record<string, unknown>)
        : null;

    if (displayStatus === "Đang trống") {
      current.empty += 1;
    } else {
      current.rented += 1;
      current.monthlyRevenue += toNumber(
        contractRecord?.monthly_price ?? room.price,
      );
    }

    if (displayStatus === "Sắp trống") current.upcoming += 1;
    groups.set(propertyId, current);
  }

  return [...groups.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.name.localeCompare(right.name, "vi");
  });
}

function normalizeContracts(value: unknown): DashboardContract[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DashboardContract => Boolean(item && typeof item === "object"),
  );
}

export default async function OwnerPage() {
  const [dashboardData, roomData] = await Promise.all([
    getOwnerDashboard(),
    getOwnerRooms(),
  ]);

  const dashboard =
    dashboardData && typeof dashboardData === "object"
      ? (dashboardData as Record<string, unknown>)
      : {};
  const summary =
    dashboard.summary && typeof dashboard.summary === "object"
      ? (dashboard.summary as Record<string, unknown>)
      : {};
  const rooms = Array.isArray(roomData) ? roomData : [];
  const recentContracts = normalizeContracts(dashboard.recent_contracts);
  const expiringContracts = normalizeContracts(dashboard.expiring_contracts);
  const propertyOverview = buildPropertyOverview(rooms);

  const totalRooms = toNumber(summary.total_rooms ?? rooms.length);
  const rentedRooms = toNumber(summary.rented_rooms);
  const emptyRooms = toNumber(summary.empty_rooms);
  const upcomingRooms = toNumber(summary.upcoming_rooms);
  const occupancyRate =
    totalRooms > 0 ? Math.round((rentedRooms / totalRooms) * 100) : 0;
  const emptyPropertyCount = propertyOverview.filter(
    (property) => property.empty > 0,
  ).length;

  const projectedRevenue = propertyOverview.reduce(
    (total, item) => total + item.monthlyRevenue,
    0,
  );
  const maxChartValue = Math.max(
    1,
    ...propertyOverview.map((item) => Math.max(item.rented, item.empty)),
  );
  const chartItems = propertyOverview.slice(0, 6);

  const kpis = [
    {
      label: "Tổng số BĐS",
      value: toNumber(summary.total_properties),
      suffix: "Tòa nhà",
      icon: Building2,
      href: null,
    },
    {
      label: "Tỷ lệ lấp đầy",
      value: `${occupancyRate}%`,
      suffix: `${rentedRooms}/${totalRooms} phòng đang thuê`,
      icon: TrendingUp,
      href: null,
    },
    {
      label: "Tòa nhà còn phòng trống",
      value: emptyPropertyCount,
      suffix: `${emptyRooms} phòng đang trống · Bấm để xem`,
      icon: Warehouse,
      href: "/owner/rooms?status=empty",
    },
    {
      label: "Hợp đồng sắp hết hạn",
      value: expiringContracts.length,
      suffix: "Trong 30 ngày tới",
      icon: CalendarClock,
      href: "/owner/contracts",
    },
  ];

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-[#8b5a32]/20 bg-[#fff8ec] shadow-[0_18px_45px_rgba(91,57,29,0.10)] sm:rounded-[24px]">
        <div className="flex min-w-0 flex-col gap-4 border-b border-[#8b5a32]/15 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#946c48]">
              <Sparkles size={14} />
              Tổng quan vận hành
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#432918] sm:text-3xl">
              Dashboard chủ nhà
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7b604a]">
              Theo dõi tòa nhà, công suất phòng và các hợp đồng cần xử lý.
            </p>
          </div>

          <Link
            href="/owner/properties/create"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 py-2.5 text-sm font-semibold text-[#fff8eb] shadow-sm transition hover:bg-[#623817] sm:w-auto"
          >
            <Building2 size={17} />
            Thêm tòa nhà
          </Link>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-5 xl:grid-cols-4 xl:p-6">
          {kpis.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#f4d9b5]/10 transition group-hover:scale-110" />
                <div className="relative flex h-full min-w-0 flex-col justify-between gap-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.07em] text-[#f1d7b5] sm:text-sm">
                      {item.label}
                    </p>
                    <Icon className="shrink-0 text-[#f1d2a8]" size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-2xl font-bold leading-tight sm:text-3xl">
                      {item.value}
                    </p>
                    <p className="mt-2 break-words text-[11px] leading-4 text-[#ead0ad] sm:text-xs">
                      {item.suffix}
                    </p>
                  </div>
                </div>
              </>
            );

            const className =
              "group relative min-h-[138px] min-w-0 overflow-hidden rounded-[18px] bg-gradient-to-br from-[#84532d] to-[#68401f] p-4 text-[#fff7e9] shadow-[0_14px_28px_rgba(91,54,24,0.18)] transition sm:min-h-[155px] sm:p-5";

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={`${className} hover:-translate-y-0.5 hover:shadow-[0_18px_32px_rgba(91,54,24,0.25)]`}
              >
                {content}
              </Link>
            ) : (
              <article key={item.label} className={className}>
                {content}
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-12 xl:gap-5">
        <div className="min-w-0 space-y-4 xl:col-span-8 xl:space-y-5">
          <section className="min-w-0 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px] sm:p-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[#744923]">
                  <BarChart3 size={20} />
                  <h2 className="text-sm font-bold uppercase tracking-wide sm:text-lg">
                    Thống kê phòng mỗi tòa nhà
                  </h2>
                </div>
                <p className="mt-1 text-sm text-[#846951]">
                  So sánh phòng đang thuê và đang trống trong phạm vi bạn quản lý.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#74583e]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#75451f]" />
                  Đang thuê
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#d9b989]" />
                  Đang trống
                </span>
              </div>
            </div>

            {chartItems.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#f8ead7] px-5 py-10 text-center text-sm text-[#7d624b]">
                Chưa có dữ liệu phòng để hiển thị biểu đồ.
              </div>
            ) : (
              <div className="mt-5 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {chartItems.map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 rounded-2xl border border-[#a9825f]/20 bg-[#f8ead7] p-3"
                  >
                    <div className="flex h-32 items-end justify-center gap-2 sm:h-40">
                      <ChartBar
                        value={item.rented}
                        maxValue={maxChartValue}
                        tone="dark"
                        label="Đang thuê"
                      />
                      <ChartBar
                        value={item.empty}
                        maxValue={maxChartValue}
                        tone="light"
                        label="Đang trống"
                      />
                    </div>
                    <p
                      title={item.name}
                      className="mt-3 line-clamp-2 min-h-8 break-words text-center text-[11px] font-semibold leading-4 text-[#5f4631] sm:text-xs"
                    >
                      {item.name}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px]">
            <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-sm font-bold uppercase tracking-wide text-[#4f321e] sm:text-lg">
                  Tổng quan chi tiết tòa nhà
                </h2>
                <p className="mt-1 text-sm text-[#846951]">
                  Công suất phòng và doanh thu dự kiến theo tháng.
                </p>
              </div>
              <Link
                href="/owner/properties"
                className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-[#744722] hover:underline sm:inline-flex"
              >
                Xem tất cả
                <ArrowRight size={16} />
              </Link>
            </div>

            {propertyOverview.length === 0 ? (
              <div className="border-t border-[#a77c55]/15 px-5 py-10 text-center text-sm text-[#80634a]">
                Chưa có tòa nhà hoặc phòng để tổng hợp.
              </div>
            ) : (
              <>
                <div className="hidden lg:block">
                  <table className="w-full table-fixed border-collapse text-left text-sm">
                    <thead className="bg-[#754722] text-[#fff5e7]">
                      <tr>
                        <th className="w-[34%] px-4 py-3 font-semibold">Tòa nhà</th>
                        <th className="w-[18%] px-3 py-3 font-semibold">Lấp đầy</th>
                        <th className="px-2 py-3 text-center font-semibold">Trống</th>
                        <th className="px-2 py-3 text-center font-semibold">Đang thuê</th>
                        <th className="px-2 py-3 text-center font-semibold">Sắp trống</th>
                        <th className="w-[20%] px-4 py-3 text-right font-semibold">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertyOverview.map((item, index) => {
                        const rate =
                          item.total > 0
                            ? Math.round((item.rented / item.total) * 100)
                            : 0;

                        return (
                          <tr
                            key={item.id}
                            className={`border-t border-[#b99673]/20 ${
                              index % 2 === 0 ? "bg-[#fffaf2]" : "bg-[#f6e8d5]"
                            }`}
                          >
                            <td className="px-4 py-3.5 font-semibold text-[#4d3422]">
                              <span className="line-clamp-2 break-words">
                                {item.name}
                              </span>
                            </td>
                            <td className="px-3 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="w-9 shrink-0 font-semibold text-[#61442f]">
                                  {rate}%
                                </span>
                                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#dfc8a8]">
                                  <div
                                    className="h-full rounded-full bg-[#7a4b27]"
                                    style={{ width: `${rate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3.5 text-center">{item.empty}</td>
                            <td className="px-2 py-3.5 text-center">{item.rented}</td>
                            <td className="px-2 py-3.5 text-center">{item.upcoming}</td>
                            <td className="break-words px-4 py-3.5 text-right font-semibold text-[#5c3d27]">
                              {formatCurrency(item.monthlyRevenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 border-t border-[#a77c55]/15 p-3 lg:hidden">
                  {propertyOverview.map((item) => {
                    const rate =
                      item.total > 0
                        ? Math.round((item.rented / item.total) * 100)
                        : 0;

                    return (
                      <article
                        key={item.id}
                        className="min-w-0 rounded-2xl border border-[#a87d56]/20 bg-[#f8ead7] p-4"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-bold text-[#4d3422]">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-[#80634a]">
                            {item.total} phòng · {rate}% lấp đầy
                          </p>
                          <p className="mt-2 break-words text-sm font-semibold text-[#684324]">
                            {formatCurrency(item.monthlyRevenue)}/tháng
                          </p>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                          <MiniMetric label="Đang thuê" value={item.rented} />
                          <MiniMetric label="Đang trống" value={item.empty} />
                          <MiniMetric label="Sắp trống" value={item.upcoming} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4 xl:col-span-4 xl:space-y-5">
          <section className="min-w-0 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Clock3 size={19} className="shrink-0 text-[#754722]" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-[#4f321e] sm:text-base">
                  Việc cần chú ý
                </h2>
              </div>
              <span className="shrink-0 rounded-full bg-[#ead2b2] px-2.5 py-1 text-xs font-semibold text-[#6f4727]">
                Hôm nay
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              <AttentionItem
                href="/owner/contracts"
                icon={FileText}
                title="Hợp đồng cần theo dõi"
                description={`${expiringContracts.length} hợp đồng hết hạn trong 30 ngày`}
              />
              <AttentionItem
                href="/owner/rooms?status=empty"
                icon={Home}
                title="Phòng đang trống"
                description={`${emptyRooms} phòng cần lấp đầy`}
              />
              <AttentionItem
                href="/owner/rooms"
                icon={CalendarClock}
                title="Phòng sắp trống"
                description={`${upcomingRooms} phòng cần chuẩn bị kế hoạch`}
              />
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px] sm:p-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <h2 className="min-w-0 text-sm font-bold uppercase tracking-wide text-[#4f321e] sm:text-base">
                Gia hạn hợp đồng sắp tới
              </h2>
              <Link
                href="/owner/contracts"
                className="shrink-0 text-xs font-semibold text-[#81532f] hover:underline"
              >
                Xem tất cả
              </Link>
            </div>

            {expiringContracts.length === 0 ? (
              <p className="mt-4 rounded-xl bg-[#f4e4ce] p-4 text-sm text-[#7c6048]">
                Không có hợp đồng sắp hết hạn.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-[#b58f69]/20">
                {expiringContracts.slice(0, 4).map((item, index) => {
                  const remaining = daysUntil(item.end_date);
                  const contractId = relationId(item.id);
                  const propertyName = relationLabel(
                    item.property,
                    "Tòa nhà",
                    ["name", "address", "code"],
                  );
                  const roomName = relationLabel(item.room, "Phòng", [
                    "room_code",
                    "name",
                    "code",
                  ]);
                  const tenantName = relationLabel(
                    item.tenant,
                    "",
                    ["full_name", "name"],
                  );

                  return (
                    <Link
                      key={contractId ?? `${roomName}-${index}`}
                      href={
                        contractId
                          ? `/owner/contracts/${contractId}`
                          : "/owner/contracts"
                      }
                      className="group flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#4e3523]">
                          {propertyName} · {roomName}
                        </p>
                        <p className="mt-1 text-xs text-[#80634a]">
                          {formatDate(item.end_date)}
                          {remaining !== null
                            ? ` · còn ${Math.max(remaining, 0)} ngày`
                            : ""}
                        </p>
                        {tenantName ? (
                          <p className="mt-1 truncate text-xs text-[#9a7758]">
                            {tenantName}
                          </p>
                        ) : null}
                      </div>
                      <ArrowRight
                        size={16}
                        className="mt-1 shrink-0 text-[#9b7655] transition group-hover:translate-x-1"
                      />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-2xl bg-gradient-to-br from-[#79502d] to-[#5b351c] p-5 text-[#fff8eb] shadow-[0_16px_34px_rgba(86,50,23,0.20)] sm:rounded-[22px]">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#eacda7]">
              Tổng hợp tài chính
            </p>
            <h2 className="mt-1 text-lg font-bold">Doanh thu dự kiến/tháng</h2>
            <p className="mt-5 break-words text-2xl font-bold sm:text-3xl">
              {formatCurrency(projectedRevenue)}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0 rounded-xl bg-white/10 p-3">
                <p className="text-xs text-[#e6c9a5]">Phòng đang thuê</p>
                <p className="mt-1 text-lg font-bold">{rentedRooms}</p>
              </div>
              <div className="min-w-0 rounded-xl bg-white/10 p-3">
                <p className="text-xs text-[#e6c9a5]">Tòa nhà còn trống</p>
                <p className="mt-1 text-lg font-bold">{emptyPropertyCount}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="min-w-0 rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:rounded-[22px] sm:p-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#4f321e] sm:text-lg">
              Hợp đồng gần đây
            </h2>
            <p className="mt-1 text-sm text-[#846951]">
              Hoạt động hợp đồng mới nhất trong danh mục của bạn.
            </p>
          </div>
          <Link
            href="/owner/contracts"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#744722] hover:underline"
          >
            Xem tất cả
            <ArrowRight size={16} />
          </Link>
        </div>

        {recentContracts.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-[#aa825d]/35 bg-[#f8ead7] px-5 py-10 text-center text-sm text-[#7d624b]">
            Chưa có hợp đồng.
          </p>
        ) : (
          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentContracts.slice(0, 6).map((item, index) => {
              const contractId = relationId(item.id);
              const tenantName = relationLabel(item.tenant, "Khách thuê", [
                "full_name",
                "name",
              ]);
              const propertyName = relationLabel(item.property, "Tòa nhà", [
                "name",
                "address",
                "code",
              ]);
              const roomName = relationLabel(item.room, "Phòng", [
                "room_code",
                "name",
                "code",
              ]);

              return (
                <article
                  key={contractId ?? `${roomName}-${index}`}
                  className="min-w-0 rounded-2xl border border-[#a77c55]/20 bg-[#f7e8d3] p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-[#4d3422]">
                        {tenantName}
                      </p>
                      <p className="mt-1 truncate text-sm text-[#775941]">
                        {propertyName} · {roomName}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#79502d] p-2 text-[#fff6e8]">
                      <KeyRound size={16} />
                    </span>
                  </div>

                  <div className="mt-4 flex min-w-0 items-end justify-between gap-3 border-t border-[#b28e69]/25 pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-[#9a7657]">
                        Giá thuê
                      </p>
                      <p className="mt-1 break-words text-sm font-bold text-[#5a3b25]">
                        {toNumber(item.monthly_price) > 0
                          ? formatCurrency(toNumber(item.monthly_price))
                          : "Chưa cập nhật"}
                      </p>
                    </div>
                    {contractId ? (
                      <Link
                        href={`/owner/contracts/${contractId}`}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#744722] hover:underline"
                      >
                        Chi tiết
                        <ArrowRight size={14} />
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ChartBar({
  value,
  maxValue,
  tone,
  label,
}: {
  value: number;
  maxValue: number;
  tone: "dark" | "light";
  label: string;
}) {
  const percentage = value > 0 ? Math.max((value / maxValue) * 100, 5) : 2;

  return (
    <div className="flex h-full w-7 min-w-0 flex-col justify-end sm:w-8">
      <span className="mb-1 text-center text-xs font-bold text-[#5c402d]">
        {value}
      </span>
      <div
        title={`${label}: ${value}`}
        className={`w-full rounded-t-md transition hover:opacity-85 ${
          tone === "dark"
            ? "bg-gradient-to-t from-[#643815] to-[#8a572d]"
            : "bg-gradient-to-t from-[#c9a16d] to-[#e2c79f]"
        }`}
        style={{ height: `${percentage}%` }}
      />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#fff8ed] px-1.5 py-2.5 sm:px-2">
      <p className="font-bold text-[#5d3d27]">{value}</p>
      <p className="mt-1 break-words text-[10px] leading-3 text-[#8a6b50]">
        {label}
      </p>
    </div>
  );
}

function AttentionItem({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#ad835d]/20 bg-[#f5e4cd] p-3 transition hover:bg-[#eed8bb]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#79502d] text-[#fff6e8]">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[#4e3523]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-[#80634a]">{description}</p>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 text-[#9b7655] transition group-hover:translate-x-1"
      />
    </Link>
  );
}
