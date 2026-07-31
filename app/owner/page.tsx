import Link from "next/link";
import {
  ArrowRight,
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

import OwnerPropertyDashboard, {
  type OwnerPropertyDashboardItem,
} from "@/components/owner/OwnerPropertyDashboard";
import { getOwnerDashboard } from "@/lib/owner/getOwnerDashboard";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";
import { getProperties } from "@/lib/owner/getProperties";

type DashboardContract = {
  id?: unknown;
  tenant?: unknown;
  room?: unknown;
  property?: unknown;
  monthly_price?: unknown;
  created_at?: unknown;
  end_date?: unknown;
};

type PropertyOverview = OwnerPropertyDashboardItem;

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

  if (!property || typeof property !== "object") {
    return "Chưa có địa chỉ";
  }

  const record =
    property as Record<string, unknown>;

  const fullAddress = [
    asString(record.house_number),
    asString(record.address),
    asString(record.ward),
    asString(record.district),
    asString(record.city),
  ]
    .filter(Boolean)
    .join(", ");


  return (
    fullAddress ||
    asString(record.name) ||
    "Chưa có địa chỉ"
  );
}

function buildPropertyOverview(
  properties: unknown[],
  rooms: unknown[],
): PropertyOverview[] {
  const groups = new Map<string, PropertyOverview>();

  /**
   * Khởi tạo từ getProperties() để luôn có đủ danh sách tòa nhà
   * user đang quản lý, kể cả tòa nhà chưa có phòng.
   */
  for (const candidate of properties) {
    if (!candidate || typeof candidate !== "object") continue;

    const property = candidate as Record<string, unknown>;
    const propertyId = asString(property.id);

    if (!propertyId) continue;

    const houseNumber = asString(property.house_number);
    const address = asString(property.address);
    const ward = asString(property.ward);
    const district = asString(property.district);
    const city = asString(property.city);

    const fullAddress = [
      houseNumber,
      address,
      ward,
      district,
      city,
    ]
      .filter(Boolean)
      .join(", ");

    groups.set(propertyId, {
      id: propertyId,
      code: asString(property.code),
      name: propertyDisplayName(property),
      houseNumber,
      address,
      ward,
      district,
      city,
      fullAddress,
      total: 0,
      rented: 0,
      empty: 0,
      upcoming: 0,
      monthlyRevenue: 0,
    });
  }

  /**
   * Tính số phòng và doanh thu từ getOwnerRooms().
   * Dữ liệu room vẫn được giới hạn theo property membership.
   */
  for (const candidate of rooms) {
    if (!candidate || typeof candidate !== "object") continue;

    const room = candidate as Record<string, unknown>;
    const propertyRelation = firstRelation(room.property);
    const propertyRecord =
      propertyRelation && typeof propertyRelation === "object"
        ? (propertyRelation as Record<string, unknown>)
        : {};

    const propertyId =
      relationId(propertyRelation) ||
      asString(room.property_id);

    if (!propertyId) continue;

    let current = groups.get(propertyId);

    /**
     * Fallback phòng trường hợp dữ liệu property relation tồn tại
     * nhưng chưa có trong danh sách khởi tạo.
     */
    if (!current) {
      const houseNumber = asString(propertyRecord.house_number);
      const address = asString(propertyRecord.address);
      const ward = asString(propertyRecord.ward);
      const district = asString(propertyRecord.district);
      const city = asString(propertyRecord.city);

      current = {
        id: propertyId,
        code: asString(propertyRecord.code),
        name: propertyDisplayName(propertyRecord),
        houseNumber,
        address,
        ward,
        district,
        city,
        fullAddress: [
          houseNumber,
          address,
          ward,
          district,
          city,
        ]
          .filter(Boolean)
          .join(", "),
        total: 0,
        rented: 0,
        empty: 0,
        upcoming: 0,
        monthlyRevenue: 0,
      };

      groups.set(propertyId, current);
    }

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
      /**
       * Giữ nguyên logic dashboard hiện tại:
       * phòng "Sắp trống" vẫn đang có người thuê nên vẫn thuộc
       * số phòng đang lấp đầy.
       */
      current.rented += 1;

      current.monthlyRevenue += toNumber(
        contractRecord?.monthly_price ?? room.price,
      );
    }

    if (displayStatus === "Sắp trống") {
      current.upcoming += 1;
    }
  }

  return [...groups.values()].sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

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
  const [dashboardData, roomData, propertyData] = await Promise.all([
  getOwnerDashboard(),
  getOwnerRooms(),
  getProperties(),
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
  const properties = Array.isArray(propertyData) ? propertyData : [];
  const recentContracts = normalizeContracts(dashboard.recent_contracts);
  const expiringContracts = normalizeContracts(dashboard.expiring_contracts);
  const propertyOverview = buildPropertyOverview(properties, rooms);

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
 
  const kpis = [
    {
      label: "Tổng số BĐS",
      value: properties.length,
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
            
          </div>

          <Link
            href="/owner/properties/create"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 py-2.5 text-sm font-semibold text-[#fff8eb] shadow-sm transition hover:bg-[#623817] sm:w-auto"
          >
            <Building2 size={17} />
            Thêm tòa nhà
          </Link>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4 xl:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#f4d9b5]/10 transition group-hover:scale-110" />
                <div className="relative flex h-full min-w-0 flex-col justify-between gap-2 sm:gap-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.07em] text-[#f1d7b5] sm:text-sm">
                      {item.label}
                    </p>
                    <Icon className="shrink-0 text-[#f1d2a8]" size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-xl font-bold leading-tight sm:text-2xl">
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
              "group relative min-h-[108px] min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#84532d] to-[#68401f] p-3 text-[#fff7e9] shadow-[0_10px_22px_rgba(91,54,24,0.16)] transition sm:min-h-[120px] sm:p-4";

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
          <OwnerPropertyDashboard items={propertyOverview} />
          
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
                  const propertyName = propertyDisplayName(item.property);
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
              const propertyName = propertyDisplayName(item.property);
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
