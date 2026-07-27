import Link from "next/link";

import ArchiveRoomButton from "@/components/owner/ArchiveRoomButton";
import RoomMediaGallery from "@/components/owner/RoomMediaGallery";
import RoomStatusControl from "@/components/owner/RoomStatusControl";
import RoomStatusHistory from "@/components/owner/RoomStatusHistory";
import { getRoomDetail } from "@/lib/owner/getRoomDetail";
import { getRoomStatusLogs } from "@/lib/owner/getRoomStatusLogs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const room = await getRoomDetail(id);
  const statusLogs = await getRoomStatusLogs(id);
  const supabase = await createSupabaseServerClient();

  const [{ data: canManage }, { data: canArchive }] = await Promise.all([
    supabase.rpc("can_manage_room", { p_room_id: room.id }),
    room.property_id
      ? supabase.rpc("can_archive_property", {
          p_property_id: room.property_id,
        })
      : Promise.resolve({ data: false, error: null }),
  ]);

  const contract = room.contract;
  const tenant = room.tenant;
  const isArchived = room.lifecycle_status === "archived";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Phòng {room.room_code}</h1>
            <PublishBadge
              lifecycleStatus={room.lifecycle_status}
              publishStatus={room.publish_status}
            />
          </div>
          <p className="mt-2 text-gray-500">
            {[room.house_number, room.address].filter(Boolean).join(" ") ||
              "Chưa có địa chỉ"}
          </p>
          <p className="text-sm text-gray-400">
            {[room.ward, room.district].filter(Boolean).join(" • ")}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Link
            href={`/owner/properties/${room.property_id}`}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-100"
          >
            ← Quay lại
          </Link>

          {canManage === true && !isArchived ? (
            <Link
              href={`/owner/rooms/${room.id}/edit`}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Chỉnh sửa phòng
            </Link>
          ) : null}

          {canArchive === true && !isArchived && room.property_id ? (
            <ArchiveRoomButton roomId={room.id} propertyId={room.property_id} />
          ) : null}
        </div>
      </div>

      {isArchived ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Phòng đã được lưu trữ và bị ẩn công khai. Dữ liệu media và lịch sử hợp
          đồng vẫn được giữ nguyên.
        </div>
      ) : room.publish_status === "draft" ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Phòng đang ở trạng thái nháp và chưa hiển thị công khai.
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Thông tin phòng</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Giá" value={formatMoney(room.price)} />
          <div>
            <p className="text-sm text-gray-500">Trạng thái vận hành</p>
            <p className="font-semibold">{room.displayStatus}</p>

            {canManage === true && !isArchived ? (
              <div className="mt-3">
                <RoomStatusControl
                  roomId={room.id}
                  currentStatus={room.status}
                />
              </div>
            ) : null}

            {room.displayStatus === "Sắp trống" &&
            room.daysRemaining !== null ? (
              <p className="mt-2 text-sm text-orange-500">
                Còn {room.daysRemaining} ngày
              </p>
            ) : null}
          </div>
          <InfoItem label="Loại phòng" value={room.room_type || "-"} />
          <InfoItem label="Địa chỉ" value={room.address || "-"} />
        </div>

        {room.description ? (
          <div className="mt-6 border-t pt-5">
            <p className="text-sm text-gray-500">Mô tả</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
              {room.description}
            </p>
          </div>
        ) : null}
      </div>

      <RoomMediaGallery
        media={room.media}
        roomId={room.id}
        canManage={canManage === true && !isArchived}
      />

      <RoomDetailsSummary details={room.details} policy={room.chinh_sach} />

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Khách thuê</h2>

        {tenant ? (
          <div className="space-y-2">
            <p>
              <strong>Họ tên:</strong> {tenant.full_name}
            </p>
            <p>
              <strong>SĐT:</strong> {tenant.phone ?? "-"}
            </p>
            <p>
              <strong>CCCD:</strong> {tenant.cccd ?? "-"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-500">Chưa có khách thuê hiện tại.</p>
            {canManage === true && !isArchived ? (
              <Link
                href={`/owner/rooms/${room.id}/tenant/new`}
                className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Thêm khách thuê
              </Link>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Hợp đồng hiện tại</h2>

        {contract ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoItem label="Bắt đầu" value={formatDate(contract.start_date)} />
            <InfoItem label="Kết thúc" value={formatDate(contract.end_date)} />
            <InfoItem
              label="Tiền thuê"
              value={formatMoney(contract.monthly_price)}
            />
            <InfoItem
              label="Tiền cọc"
              value={formatMoney(contract.deposit_amount)}
            />
            <InfoItem label="Trạng thái" value={contract.status ?? "-"} />
          </div>
        ) : (
          <p className="text-gray-500">Chưa có hợp đồng đang hiệu lực.</p>
        )}
      </div>

      <RoomStatusHistory logs={statusLogs} />
    </div>
  );
}

function PublishBadge({
  lifecycleStatus,
  publishStatus,
}: {
  lifecycleStatus?: string | null;
  publishStatus?: string | null;
}) {
  if (lifecycleStatus === "archived") {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
        Đã lưu trữ
      </span>
    );
  }

  const states: Record<string, { label: string; className: string }> = {
    published: {
      label: "Đã xuất bản",
      className: "bg-green-100 text-green-700",
    },
    hidden: {
      label: "Đang ẩn",
      className: "bg-gray-100 text-gray-700",
    },
    draft: {
      label: "Bản nháp",
      className: "bg-blue-100 text-blue-700",
    },
  };
  const state = states[publishStatus ?? "draft"] ?? states.draft;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${state.className}`}>
      {state.label}
    </span>
  );
}

function RoomDetailsSummary({
  details,
  policy,
}: {
  details: any;
  policy?: string | null;
}) {
  const feeItems = [
    ["Điện", details?.electric_fee_value, details?.electric_fee_unit],
    ["Nước", details?.water_fee_value, details?.water_fee_unit],
    ["Dịch vụ", details?.service_fee_value, details?.service_fee_unit],
    ["Giữ xe", details?.parking_fee_value, details?.parking_fee_unit],
    ["Phí khác", details?.other_fee_value, details?.other_fee_note],
  ].filter((item) => item[1] !== null && item[1] !== undefined && item[1] !== "");

  const amenities = [
    details?.has_elevator && "Thang máy",
    details?.has_stairs && "Cầu thang bộ",
    details?.has_parking && "Chỗ để xe",
    details?.has_basement && "Hầm xe",
    details?.fingerprint_lock && "Khóa vân tay",
    details?.shared_washer && "Máy giặt chung",
    details?.private_washer && "Máy giặt riêng",
    details?.shared_dryer && "Máy sấy chung",
    details?.private_dryer && "Máy sấy riêng",
    details?.short_term && "Thuê ngắn hạn",
    details?.long_term && "Thuê dài hạn",
    details?.no_pet && "Không nhận thú cưng",
    details?.allow_cat && "Nhận mèo",
    details?.allow_dog && "Nhận chó",
  ].filter(Boolean) as string[];

  if (!details && !policy) return null;

  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold">Chi phí và tiện nghi</h2>

      {feeItems.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feeItems.map(([label, value, unit]) => (
            <InfoItem
              key={String(label)}
              label={String(label)}
              value={`${Number(value).toLocaleString("vi-VN")} ${unit || "đ"}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Chưa khai báo chi phí dịch vụ.</p>
      )}

      {amenities.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {amenities.map((amenity) => (
            <span
              key={amenity}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
            >
              {amenity}
            </span>
          ))}
        </div>
      ) : null}

      {details?.other_amenities ? (
        <p className="mt-5 whitespace-pre-wrap text-sm text-gray-700">
          <strong>Tiện nghi khác:</strong> {details.other_amenities}
        </p>
      ) : null}

      {policy ? (
        <p className="mt-5 whitespace-pre-wrap border-t pt-4 text-sm text-gray-700">
          <strong>Chính sách:</strong> {policy}
        </p>
      ) : null}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function formatMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("vi-VN")} đ` : "-";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("vi-VN");
}
