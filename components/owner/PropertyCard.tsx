import Link from "next/link";

type PropertyCardData = {
  id: string;
  code?: string | null;
  name?: string | null;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
  cover_image?: string | null;
  approval_status?: string | null;
  lifecycle_status?: string | null;
  membership_role?: string | null;
  total_rooms?: number;
  rented_rooms?: number;
  empty_rooms?: number;
  upcoming_rooms?: number;
};

function getStatusLabel(property: PropertyCardData) {
  if (property.lifecycle_status === "archived") {
    return {
      text: "Đã lưu trữ",
      className: "bg-red-100 text-red-700",
    };
  }

  if (property.lifecycle_status === "inactive") {
    return {
      text: "Tạm dừng",
      className: "bg-gray-100 text-gray-700",
    };
  }

  switch (property.approval_status) {
    case "approved":
      return {
        text: "Đã duyệt",
        className: "bg-green-100 text-green-700",
      };
    case "rejected":
      return {
        text: "Bị từ chối",
        className: "bg-red-100 text-red-700",
      };
    case "pending":
      return {
        text: "Chờ duyệt",
        className: "bg-amber-100 text-amber-800",
      };
    default:
      return {
        text: "Bản nháp",
        className: "bg-gray-100 text-gray-700",
      };
  }
}

function getRoleLabel(role?: string | null) {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "viewer":
      return "Viewer";
    default:
      return "Thành viên";
  }
}

export default function PropertyCard({
  property,
}: {
  property: PropertyCardData;
}) {
  const displayName =
    property.name ||
    [property.house_number, property.address].filter(Boolean).join(" ") ||
    property.code ||
    "Chưa đặt tên";
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
    property.membership_role === "owner" || property.membership_role === "manager";

  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video bg-gray-100">
        {property.cover_image ? (
          <img
            src={property.cover_image}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Chưa có ảnh tòa nhà
          </div>
        )}

        <span
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
        >
          {status.text}
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{displayName}</h2>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {getRoleLabel(property.membership_role)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {fullAddress || "Chưa có địa chỉ"}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat value={property.total_rooms ?? 0} label="Phòng" />
          <Stat value={property.rented_rooms ?? 0} label="Đã thuê" emphasis="green" />
          <Stat value={property.empty_rooms ?? 0} label="Trống" />
          <Stat value={property.upcoming_rooms ?? 0} label="Sắp trống" emphasis="amber" />
        </div>

        <div className="space-y-2">
          <Link
            href={`/owner/properties/${property.id}`}
            className="block rounded-xl bg-black px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Xem chi tiết
          </Link>

          {canManage && property.lifecycle_status !== "archived" ? (
            <Link
              href={`/owner/rooms/create?property_id=${property.id}`}
              className="block rounded-xl border px-4 py-2 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              + Tạo phòng mới
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Stat({
  value,
  label,
  emphasis,
}: {
  value: number;
  label: string;
  emphasis?: "green" | "amber";
}) {
  const valueClass =
    emphasis === "green"
      ? "text-green-700"
      : emphasis === "amber"
        ? "text-amber-700"
        : "text-gray-900";

  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className={`text-lg font-semibold ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
