import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  CircleDollarSign,
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
  id?: string | null;
  tenant?: string | null;
  room?: string | null;
  property?: string | null;
  monthly_price?: number | string | null;
  created_at?: string | null;
  end_date?: string | null;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Chưa cập nhật";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";

  return date.toLocaleDateString("vi-VN");
}

function daysUntil(value?: string | null) {
  if (!value) return null;

  const target = new Date(`${value}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function propertyDisplayName(property: any) {
  if (!property) return "Chưa gắn tòa nhà";

  return (
    property.name ||
    [property.house_number, property.address, property.district]
      .filter(Boolean)
      .join(" ") ||
    "Tòa nhà chưa đặt tên"
  );
}

function buildPropertyOverview(rooms: any[]): PropertyOverview[] {
  const groups = new Map<string, PropertyOverview>();

  for (const room of rooms) {
    const propertyId = room.property?.id || room.property_id || "unassigned";
    const current = groups.get(propertyId) ?? {
      id: propertyId,
      name: propertyDisplayName(room.property),
      total: 0,
      rented: 0,
      empty: 0,
      upcoming: 0,
      monthlyRevenue: 0,
    };

    current.total += 1;

    if (room.displayStatus === "Đang trống") {
      current.empty += 1;
    } else {
      current.rented += 1;
      current.monthlyRevenue += toNumber(
        room.contract?.monthly_price ?? room.price,
      );
    }

    if (room.displayStatus === "Sắp trống") {
      current.upcoming += 1;
    }

    groups.set(propertyId, current);
  }

  return [...groups.values()].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return left.name.localeCompare(right.name, "vi");
  });
}

export default async function OwnerPage() {
  const [dashboardData, rooms] = await Promise.all([
    getOwnerDashboard(),
    getOwnerRooms(),
  ]);

  const summary = dashboardData?.summary ?? {};
  const recentContracts = (dashboardData?.recent_contracts ?? []) as DashboardContract[];
  const expiringContracts = (dashboardData?.expiring_contracts ?? []) as DashboardContract[];
  const propertyOverview = buildPropertyOverview(rooms as any[]);

  const totalRooms = toNumber(summary.total_rooms ?? rooms.length);
  const rentedRooms = toNumber(summary.rented_rooms);
  const emptyRooms = toNumber(summary.empty_rooms);
  const upcomingRooms = toNumber(summary.upcoming_rooms);
  const occupancyRate = totalRooms > 0 ? Math.round((rentedRooms / totalRooms) * 100) : 0;

  const rentValues = (rooms as any[])
    .map((room) => toNumber(room.contract?.monthly_price ?? room.price))
    .filter((value) => value > 0);
  const averageRent =
    rentValues.length > 0
      ? Math.round(
          rentValues.reduce((total, value) => total + value, 0) /
            rentValues.length,
        )
      : 0;

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
    },
    {
      label: "Tỷ lệ lấp đầy",
      value: `${occupancyRate}%`,
      suffix: `${rentedRooms}/${totalRooms} phòng đang thuê`,
      icon: TrendingUp,
    },
    {
      label: "Giá thuê trung bình",
      value: averageRent > 0 ? formatCurrency(averageRent) : "—",
      suffix: "Theo dữ liệu phòng hiện tại",
      icon: CircleDollarSign,
    },
    {
      label: "Hợp đồng sắp hết hạn",
      value: expiringContracts.length,
      suffix: "Trong 30 ngày tới",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-[#8b5a32]/20 bg-[#fff8ec] shadow-[0_18px_45px_rgba(91,57,29,0.10)]">
        <div className="flex flex-col gap-4 border-b border-[#8b5a32]/15 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#946c48]">
              <Sparkles size={14} />
              Tổng quan vận hành
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#432918] sm:text-3xl">
              Dashboard chủ nhà
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#7b604a]">
              Theo dõi tòa nhà, công suất phòng và các hợp đồng cần xử lý trong một màn hình.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/owner/properties/create"
              className="inline-flex items-center gap-2 rounded-xl bg-[#744722] px-4 py-2.5 text-sm font-semibold text-[#fff8eb] shadow-sm transition hover:bg-[#623817]"
            >
              <Building2 size={17} />
              Thêm tòa nhà
            </Link>
            <Link
              href="/owner/rooms"
              className="inline-flex items-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#f5e5cf] px-4 py-2.5 text-sm font-semibold text-[#684324] transition hover:bg-[#ecd4b5]"
            >
              <Warehouse size={17} />
              Quản lý phòng
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-3 sm:gap-4 sm:p-5 xl:grid-cols-4 xl:p-6">
          {kpis.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.label}
                className="group relative min-h-[150px] overflow-hidden rounded-[20px] bg-gradient-to-br from-[#84532d] to-[#68401f] p-4 text-[#fff7e9] shadow-[0_14px_28px_rgba(91,54,24,0.18)] sm:min-h-[165px] sm:p-5"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#f4d9b5]/10 transition group-hover:scale-110" />
                <div className="relative flex h-full flex-col justify-between gap-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#f1d7b5] sm:text-sm">
                      {item.label}
                    </p>
                    <Icon className="text-[#f1d2a8]" size={22} />
                  </div>
                  <div>
                    <p className="break-words text-2xl font-bold leading-tight sm:text-3xl">
                      {item.value}
                    </p>
                    <p className="mt-2 text-[11px] leading-4 text-[#ead0ad] sm:text-xs">
                      {item.suffix}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[#744923]">
                  <BarChart3 size={20} />
                  <h2 className="text-base font-bold uppercase tracking-wide sm:text-lg">
                    Thống kê phòng mỗi tòa nhà
                  </h2>
                </div>
                <p className="mt-1 text-sm text-[#846951]">
                  So sánh số phòng đang thuê và đang trống theo dữ liệu hiện tại.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-medium text-[#74583e]">
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
              <div className="mt-6 rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#f8ead7] px-5 py-12 text-center text-sm text-[#7d624b]">
                Chưa có dữ liệu phòng để hiển thị biểu đồ.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto pb-2">
                <div className="min-w-[620px]">
                  <div className="relative h-[260px] border-b border-l border-[#b49372]/35">
                    {[0, 25, 50, 75, 100].map((step) => (
                      <div
                        key={step}
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#cbb293]/30"
                        style={{ bottom: `${step}%` }}
                      />
                    ))}

                    <div className="absolute inset-0 grid grid-cols-6 items-end gap-5 px-6 pt-8">
                      {chartItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex h-full min-w-0 flex-col justify-end"
                        >
                          <div className="flex h-[190px] items-end justify-center gap-2">
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
                            className="mt-3 line-clamp-2 min-h-10 text-center text-xs font-semibold leading-4 text-[#5f4631]"
                          >
                            {item.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-bold uppercase tracking-wide text-[#4f321e] sm:text-lg">
                  Tổng quan chi tiết tòa nhà
                </h2>
                <p className="mt-1 text-sm text-[#846951]">
                  Công suất phòng và doanh thu dự kiến theo tháng.
                </p>
              </div>
              <Link
                href="/owner/properties"
                className="hidden items-center gap-1 text-sm font-semibold text-[#744722] hover:underline sm:inline-flex"
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
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="bg-[#754722] text-[#fff5e7]">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Tòa nhà</th>
                        <th className="px-4 py-3 font-semibold">Lấp đầy</th>
                        <th className="px-4 py-3 text-center font-semibold">Phòng trống</th>
                        <th className="px-4 py-3 text-center font-semibold">Đang thuê</th>
                        <th className="px-4 py-3 text-center font-semibold">Sắp trống</th>
                        <th className="px-5 py-3 text-right font-semibold">Doanh thu/tháng</th>
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
                            <td className="px-5 py-3.5 font-semibold text-[#4d3422]">
                              {item.id === "unassigned" ? (
                                item.name
                              ) : (
                                <Link
                                  href={`/owner/properties/${item.id}`}
                                  className="hover:text-[#8a5327] hover:underline"
                                >
                                  {item.name}
                                </Link>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="w-9 font-semibold text-[#61442f]">
                                  {rate}%
                                </span>
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#dfc8a8]">
                                  <div
                                    className="h-full rounded-full bg-[#7a4b27]"
                                    style={{ width: `${rate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center">{item.empty}</td>
                            <td className="px-4 py-3.5 text-center">{item.rented}</td>
                            <td className="px-4 py-3.5 text-center">{item.upcoming}</td>
                            <td className="px-5 py-3.5 text-right font-semibold text-[#5c3d27]">
                              {formatCurrency(item.monthlyRevenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 border-t border-[#a77c55]/15 p-3 md:hidden">
                  {propertyOverview.map((item) => {
                    const rate =
                      item.total > 0
                        ? Math.round((item.rented / item.total) * 100)
                        : 0;

                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-[#a87d56]/20 bg-[#f8ead7] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-[#4d3422]">{item.name}</p>
                            <p className="mt-1 text-xs text-[#80634a]">
                              {item.total} phòng · {rate}% lấp đầy
                            </p>
                          </div>
                          <span className="rounded-full bg-[#79502d] px-2.5 py-1 text-xs font-semibold text-[#fff5e7]">
                            {formatCurrency(item.monthlyRevenue)}
                          </span>
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

        <aside className="space-y-5 xl:col-span-4">
          <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock3 size={19} className="text-[#754722]" />
                <h2 className="font-bold uppercase tracking-wide text-[#4f321e]">
                  Việc cần chú ý
                </h2>
              </div>
              <span className="rounded-full bg-[#ead2b2] px-2.5 py-1 text-xs font-semibold text-[#6f4727]">
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
                href="/owner/rooms"
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

          <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold uppercase tracking-wide text-[#4f321e]">
                Gia hạn hợp đồng sắp tới
              </h2>
              <Link
                href="/owner/contracts"
                className="text-xs font-semibold text-[#81532f] hover:underline"
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

                  return (
                    <Link
                      key={item.id ?? `${item.room}-${index}`}
                      href={item.id ? `/owner/contracts/${item.id}` : "/owner/contracts"}
                      className="group flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#4e3523]">
                          {item.property || "Tòa nhà"} · {item.room || "Phòng"}
                        </p>
                        <p className="mt-1 text-xs text-[#80634a]">
                          {formatDate(item.end_date)}
                          {remaining !== null
                            ? ` · còn ${Math.max(remaining, 0)} ngày`
                            : ""}
                        </p>
                        {item.tenant ? (
                          <p className="mt-1 truncate text-xs text-[#9a7758]">
                            {item.tenant}
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

          <section className="rounded-[22px] bg-gradient-to-br from-[#79502d] to-[#5b351c] p-5 text-[#fff8eb] shadow-[0_16px_34px_rgba(86,50,23,0.20)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#eacda7]">
                  Tổng hợp tài chính
                </p>
                <h2 className="mt-1 text-lg font-bold">Doanh thu dự kiến/tháng</h2>
              </div>
              <CircleDollarSign size={25} className="text-[#efd3ad]" />
            </div>

            <p className="mt-6 break-words text-2xl font-bold sm:text-3xl">
              {formatCurrency(projectedRevenue)}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs text-[#e6c9a5]">Phòng đang thuê</p>
                <p className="mt-1 text-lg font-bold">{rentedRooms}</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs text-[#e6c9a5]">Giá thuê TB</p>
                <p className="mt-1 truncate text-sm font-bold">
                  {averageRent > 0 ? formatCurrency(averageRent) : "—"}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold uppercase tracking-wide text-[#4f321e] sm:text-lg">
              Hợp đồng gần đây
            </h2>
            <p className="mt-1 text-sm text-[#846951]">
              Hoạt động hợp đồng mới nhất trong danh mục của bạn.
            </p>
          </div>
          <Link
            href="/owner/contracts"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#744722] hover:underline"
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
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentContracts.slice(0, 6).map((item, index) => (
              <article
                key={item.id ?? `${item.room}-${index}`}
                className="rounded-2xl border border-[#a77c55]/20 bg-[#f7e8d3] p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#4d3422]">
                      {item.tenant || "Khách thuê"}
                    </p>
                    <p className="mt-1 truncate text-sm text-[#775941]">
                      {item.property || "Tòa nhà"} · {item.room || "Phòng"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-[#79502d] p-2 text-[#fff6e8]">
                    <KeyRound size={16} />
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#b28e69]/25 pt-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-[#9a7657]">
                      Giá thuê
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#5a3b25]">
                      {toNumber(item.monthly_price) > 0
                        ? formatCurrency(toNumber(item.monthly_price))
                        : "Chưa cập nhật"}
                    </p>
                  </div>
                  {item.id ? (
                    <Link
                      href={`/owner/contracts/${item.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#744722] hover:underline"
                    >
                      Chi tiết
                      <ArrowRight size={14} />
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
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
    <div className="flex h-full w-8 flex-col justify-end sm:w-10">
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
    <div className="rounded-xl bg-[#fff8ed] px-2 py-2.5">
      <p className="font-bold text-[#5d3d27]">{value}</p>
      <p className="mt-1 text-[10px] leading-3 text-[#8a6b50]">{label}</p>
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
      className="group flex items-center gap-3 rounded-2xl border border-[#ad835d]/20 bg-[#f5e4cd] p-3 transition hover:bg-[#eed8bb]"
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
