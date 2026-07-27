import Link from "next/link";

import PropertyInvitationsPanel from "@/components/owner/PropertyInvitationsPanel";
import RoomCard from "@/components/owner/RoomCard";
import { getPropertyDetail } from "@/lib/owner/getPropertyDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PropertyMember = {
  id?: string;
  user_id?: string;
  role?: string;
  status?: string;
};

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const members = (data.members ?? []) as PropertyMember[];
  const currentMembership = members.find(
    (member) => member.user_id === user?.id && member.status === "active",
  );
  const canManage =
    currentMembership?.role === "owner" || currentMembership?.role === "manager";
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
          </div>
          <p className="mt-2 text-gray-500">{fullAddress || "Chưa có địa chỉ"}</p>
          {property.code ? (
            <p className="mt-1 text-sm text-gray-400">Mã tòa nhà: {property.code}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && property.lifecycle_status !== "archived" ? (
            <Link
              href={`/owner/rooms/create?property_id=${property.id}`}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + Tạo phòng
            </Link>
          ) : null}
          <Link
            href="/owner/properties"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            ← Danh sách tòa nhà
          </Link>
        </div>
      </div>

      {property.approval_status === "pending" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tòa nhà đang chờ Admin duyệt. Phòng mới chỉ được lưu ở trạng thái nháp
          và chưa thể xuất bản công khai.
        </div>
      ) : null}

      {property.approval_status === "rejected" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Tòa nhà đã bị từ chối duyệt. Kiểm tra ghi chú phê duyệt và cập nhật dữ
          liệu trước khi gửi lại.
          {property.approval_note ? (
            <p className="mt-2 font-medium">Ghi chú: {property.approval_note}</p>
          ) : null}
        </div>
      ) : null}

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

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Thành viên tòa nhà</h2>
            <p className="mt-1 text-sm text-gray-500">
              Membership active quyết định quyền xem và quản lý dữ liệu.
            </p>
          </div>
          <span className="text-sm text-gray-500">{members.length} thành viên</span>
        </div>

        {members.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Chưa có membership.</p>
        ) : (
          <div className="mt-4 divide-y rounded-xl border">
            {members.map((member, index) => (
              <div
                key={member.id ?? `${member.user_id}-${index}`}
                className="flex items-center justify-between gap-4 p-4 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {member.user_id === user?.id ? "Tài khoản của bạn" : member.user_id}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Role: {member.role ?? "-"}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {member.status ?? "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

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
