import Link from "next/link";
import {
  normalizeRoomStatus,
  type OwnerPropertyReference,
  type OwnerTenantReference,
} from "@/lib/owner/types";

type RoomCardData = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  status?: string | null;
  displayStatus?: string | null;
  daysRemaining?: number | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  property?: OwnerPropertyReference | null;
};

function propertyLabel(property?: OwnerPropertyReference | null) {
  if (!property) return null;

  return (
    property.name ||
    [property.house_number, property.address, property.district]
      .filter(Boolean)
      .join(" ") ||
    null
  );
}

export default function RoomCard({
  room,
}: {
  room: RoomCardData;
}) {
  const status =
    normalizeRoomStatus(room.displayStatus) ??
    normalizeRoomStatus(room.status) ??
    "Đang trống";

  const statusStyle =
    status === "Đã thuê"
      ? "bg-green-100 text-green-700"
      : status === "Sắp trống"
        ? "bg-orange-100 text-orange-700"
        : "bg-gray-100 text-gray-700";

  const tenants = Array.isArray(room.tenant)
    ? room.tenant
    : room.tenant
      ? [room.tenant]
      : [];

  const currentTenant = tenants[0];
  const buildingName = propertyLabel(room.property);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            Phòng {room.room_code || "-"}
          </h3>
          <p className="text-sm text-gray-500">
            {room.room_type || "Chưa phân loại"}
          </p>
          {buildingName && (
            <p className="mt-1 text-xs text-gray-500">
              {buildingName}
            </p>
          )}
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle}`}
        >
          {status}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p>
          Giá:{" "}
          <strong>
            {room.price === null || room.price === undefined
              ? "-"
              : `${Number(room.price).toLocaleString("vi-VN")}đ`}
          </strong>
        </p>

        {room.daysRemaining !== null &&
          room.daysRemaining !== undefined &&
          room.daysRemaining >= 0 && (
            <p className="text-orange-600">
              Còn {room.daysRemaining} ngày hợp đồng
            </p>
          )}
      </div>

      {currentTenant ? (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
          <p className="font-medium">Khách thuê</p>
          <p>{currentTenant.full_name}</p>
          <p className="text-gray-500">
            {currentTenant.phone || "Chưa có SĐT"}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
          Chưa có khách thuê
        </div>
      )}

      <Link
        href={`/owner/rooms/${room.id}`}
        className="mt-4 block rounded-lg border px-3 py-2 text-center text-sm hover:bg-gray-50"
      >
        Quản lý phòng →
      </Link>
    </div>
  );
}
