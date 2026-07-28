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
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#432918] sm:text-3xl">{displayName}</h1>
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
          <p className="mt-2 text-sm text-[#80634a]">{fullAddress || "Chưa có địa chỉ"}</p>
          {property.code ? (
            <p className="mt-1 text-sm text-[#9a7758]">Mã tòa nhà: {property.code}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && property.lifecycle_status !== "archived" ? (
            <>
              <Link
                href={`/owner/properties/${property.id}/edit`}
                className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9]"
              >
                Chỉnh sửa tòa nhà
              </Link>
              <Link
                href={`/owner/rooms/create?property_id=${property.id}`}
                className="rounded-xl bg-[#744722] px-4 py-2 text-sm font-semibold text-[#fff8eb] hover:bg-[#623817]"
              >
                + Tạo phòng
              </Link>
            </>
          ) : null}
          <Link
            href="/owner/properties"
            className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9]"
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
          color="text-[#2d6a3d]"
        />
        <StatCard title="Đang trống" value={summary.empty_rooms} />
        <StatCard
          title="Sắp trống"
          value={summary.upcoming_rooms}
          color="text-[#8a5b1f]"
        />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Danh sách phòng</h2>
          <span className="text-sm text-gray-500">{rooms.length} phòng</span>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-6 text-[#80634a]">
            <p>Chưa có phòng trong tòa nhà này.</p>
            {canManage && property.lifecycle_status !== "archived" ? (
              <Link
                href={`/owner/rooms/create?property_id=${property.id}`}
                className="mt-4 inline-block rounded-xl bg-[#744722] px-4 py-2 text-sm font-semibold text-[#fff8eb]"
              >
                Tạo phòng đầu tiên
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => (
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
  color = "text-[#4d3422]",
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_10px_25px_rgba(92,61,34,0.06)]">
      <p className="text-sm text-[#80634a]">{title}</p>
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
