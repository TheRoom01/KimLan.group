import Link from "next/link";
import { ArrowRight, Building2, Plus, Users } from "lucide-react";
import DeletePropertyCardButton from "@/components/owner/DeletePropertyCardButton";

type PropertyCardData = {
  id: string;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
  cover_image?: string | null;
  lifecycle_status?: string | null;
  membership_role?: string | null;
  member_count?: number;
  total_rooms?: number;
  rented_rooms?: number;
  empty_rooms?: number;
  upcoming_rooms?: number;
};

function getStatusLabel(property: PropertyCardData) {
  if (property.lifecycle_status === "archived") {
    return { text: "Đã lưu trữ", className: "bg-red-100 text-red-700" };
  }
  if (property.lifecycle_status === "inactive") {
    return { text: "Tạm dừng", className: "bg-[#eadbc8] text-[#76573e]" };
  }
  return { text: "Đang hoạt động", className: "bg-[#dcefdc] text-[#2d6a3d]" };
}

function getRoleLabel(role?: string | null) {
  switch (role) {
    case "owner":
      return "Chủ sở hữu";
    case "manager":
      return "Quản lý";
    case "viewer":
      return "Chỉ xem";
    default:
      return "Thành viên";
  }
}

function getPropertyDisplayName(property: PropertyCardData) {
  return (
    [property.house_number, property.address, property.ward, property.district]
      .filter(Boolean)
      .join(", ") || "Chưa có địa chỉ"
  );
}

export default function PropertyCard({ property }: { property: PropertyCardData }) {
  const displayName = getPropertyDisplayName(property);
  const fullAddress = [
    property.house_number,
    property.address,
    property.ward,
    property.district,
    property.city,
  ]
    .filter(Boolean)
    .join(", ");
  const status = getStatusLabel(property);
  const canManage =
    property.membership_role === "owner" ||
    property.membership_role === "manager";
  const total = property.total_rooms ?? 0;
  const rented = property.rented_rooms ?? 0;
  const occupancy = total > 0 ? Math.round((rented / total) * 100) : 0;

  return (
    <article className="group overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(92,61,34,0.14)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#eadbc8]">
        {canManage && property.lifecycle_status !== "archived" ? <DeletePropertyCardButton propertyId={property.id} /> : null}
        {property.cover_image ? (
          <img
            src={property.cover_image}
            alt={displayName}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[#98785b]">
            <Building2 size={28} />
            <span className="text-xs">Chưa có ảnh tòa nhà</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${status.className}`}>
            {status.text}
          </span>
          <span className="rounded-full bg-[#fff9ef]/90 px-3 py-1 text-xs font-semibold text-[#684324] shadow-sm backdrop-blur">
            {getRoleLabel(property.membership_role)}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-lg font-bold text-[#432918]">
            {fullAddress || displayName}
          </h2>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#80634a]">
            <span>Tỷ lệ lấp đầy</span>
            <strong className="text-[#5a3b25]">{occupancy}%</strong>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dfc8a8]">
            <div
              className="h-full rounded-full bg-[#744722]"
              style={{ width: `${Math.min(occupancy, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat value={total} label="Phòng" />
          <Stat value={rented} label="Đã thuê" />
          <Stat value={property.empty_rooms ?? 0} label="Trống" />
          <Stat value={property.upcoming_rooms ?? 0} label="Sắp trống" />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#aa825d]/20 bg-[#f8ead7] px-3 py-2.5 text-xs text-[#74583e]">
          <Users size={16} className="shrink-0 text-[#744722]" />
          <strong className="text-[#4d3422]">{property.member_count ?? 1}</strong>
          thành viên quản lý
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={`/owner/properties/${property.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817]"
          >
            Chi tiết
            <ArrowRight size={16} />
          </Link>
          {canManage && property.lifecycle_status !== "archived" ? (
            <Link
              href={`/owner/rooms/create?property_id=${property.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 text-sm font-semibold text-[#684324] transition hover:bg-[#f3e1c9]"
            >
              <Plus size={16} />
              Thêm phòng
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f8ead7] px-1 py-2.5">
      <p className="text-base font-bold text-[#5a3b25]">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-[#8a6b50]">{label}</p>
    </div>
  );
}
