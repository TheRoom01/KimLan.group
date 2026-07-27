import Link from "next/link";

import PropertyInvitationsPanel from "@/components/owner/PropertyInvitationsPanel";
import PropertyMembersPanel, {
  type PropertyMemberItem,
} from "@/components/owner/PropertyMembersPanel";
import RoomCard from "@/components/owner/RoomCard";
import { getPropertyDetail } from "@/lib/owner/getPropertyDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPropertyDetail(id);
  const property = data.property;

  if (!property) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Không tìm thấy thông tin tòa nhà.
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    { data: canManageResult },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("can_manage_property", { p_property_id: property.id }),
  ]);
  const members = (data.members ?? []) as PropertyMemberItem[];
  const currentMembership = members.find(
    (member) => member.user_id === user?.id && member.status === "active",
  );
  const canManage = canManageResult === true;
  const isOwner = currentMembership?.role === "owner";
  const rooms = data.rooms ?? [];
  const summary = data.summary;
  const displayName =
    property.name || property.full_address || property.code || "Tòa nhà";
  const fullAddress =
    property.full_address ||
    [
      property.house_number,
      property.address,
      property.ward,
      property.district,
      property.city,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{displayName}</h1>
            <PropertyStatusBadge
              approvalStatus={property.approval_status}
              lifecycleStatus={property.lifecycle_status}
            />
            {currentMembership?.role ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {currentMembership.role}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-gray-500">{fullAddress || "Chưa có địa chỉ"}</p>
          {property.code ? (
            <p className="mt-1 text-sm text-gray-400">Mã tòa nhà: {property.code}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && property.lifecycle_status !== "archived" ? (
            <>
              <Link
                href={`/owner/properties/${property.id}/edit`}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Chỉnh sửa tòa nhà
              </Link>
              <Link
                href={`/owner/rooms/create?property_id=${property.id}`}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                + Tạo phòng
              </Link>
            </>
          ) : null}
          <Link
            href="/owner/properties"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            ← Danh sách tòa nhà
          </Link>
        </div>
      </div>

      
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Tổng phòng" value={summary.total_rooms} />
        <StatCard
          title="Đã thuê"
          value={summary.rented_rooms}
          color="text-green-600"
        />
        <StatCard title="Đang trống" value={summary.empty_rooms} />
        <StatCard
          title="Sắp trống"
          value={summary.upcoming_rooms}
          color="text-orange-600"
        />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Danh sách phòng</h2>
          <span className="text-sm text-gray-500">{rooms.length} phòng</span>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-6 text-gray-500">
            <p>Chưa có phòng trong tòa nhà này.</p>
            {canManage && property.lifecycle_status !== "archived" ? (
              <Link
                href={`/owner/rooms/create?property_id=${property.id}`}
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                Tạo phòng đầu tiên
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room: any) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      <PropertyMembersPanel
        propertyId={property.id}
        currentUserId={user?.id}
        initialMembers={members}
        isOwner={isOwner}
      />

      {canManage ? <PropertyInvitationsPanel propertyId={property.id} /> : null}
    </div>
  );
}

function StatCard({
  title,
  value,
  color = "text-gray-900",
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PropertyStatusBadge({
  approvalStatus,
  lifecycleStatus,
}: {
  approvalStatus?: string | null;
  lifecycleStatus?: string | null;
}) {
  if (lifecycleStatus === "archived") {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
        Đã lưu trữ
      </span>
    );
  }

  const states: Record<string, { label: string; className: string }> = {
    approved: {
      label: "Đã duyệt",
      className: "bg-green-100 text-green-700",
    },
    pending: {
      label: "Chờ duyệt",
      className: "bg-amber-100 text-amber-800",
    },
    rejected: {
      label: "Bị từ chối",
      className: "bg-red-100 text-red-700",
    },
    draft: {
      label: "Bản nháp",
      className: "bg-gray-100 text-gray-700",
    },
  };
  const state = states[approvalStatus ?? "draft"] ?? states.draft;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${state.className}`}>
      {state.label}
    </span>
  );
}
