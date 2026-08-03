import Link from "next/link";
import { KeyRound } from "lucide-react";

import ArchiveRoomButton from "@/components/owner/ArchiveRoomButton";
import RoomMediaGallery from "@/components/owner/RoomMediaGallery";
import RoomStatusControl from "@/components/owner/RoomStatusControl";
import RoomStatusHistory from "@/components/owner/RoomStatusHistory";
import TenantRosterCard from "@/components/owner/TenantRosterCard";
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

  const { data: canManage } = await supabase.rpc("can_manage_room", {
    p_room_id: room.id,
  });

  const contract = room.contract;
  const tenants = room.tenants ?? (room.tenant ? [room.tenant] : []);
  const isArchived = room.lifecycle_status === "archived";
  const fullAddress = formatFullAddress(
    room.house_number,
    room.address,
    room.ward,
    room.district,
  );

  return (
    <div className="w-full min-w-0 max-w-none space-y-5 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
            Quản lý phòng
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mt-1 text-2xl font-bold text-[#432918] sm:text-3xl">
              Phòng {room.room_code}
            </h1>
            <PublishBadge
              lifecycleStatus={room.lifecycle_status}
              publishStatus={room.publish_status}
            />
          </div>
          <p className="mt-2 text-sm text-[#80634a]">
            {[room.house_number, room.address].filter(Boolean).join(" ") ||
              "Chưa có địa chỉ"}
          </p>
          <p className="text-sm text-[#9a7758]">
            {[room.ward, room.district].filter(Boolean).join(" • ")}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Link
            href={`/owner/properties/${room.property_id}`}
            className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9]"
          >
            ← Quay lại
          </Link>

          {canManage === true && !isArchived ? (
            <Link
              href={`/owner/rooms/${room.id}/edit`}
              className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9]"
            >
              Chỉnh sửa phòng
            </Link>
          ) : null}

          {canManage === true && !isArchived && room.property_id ? (
            <ArchiveRoomButton roomId={room.id} propertyId={room.property_id} />
          ) : null}
        </div>
      </div>

      {isArchived ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Phòng đã được lưu trữ và bị ẩn công khai. Dữ liệu media và lịch sử hợp đồng vẫn được giữ nguyên.
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <RoomMediaGallery
            media={room.media}
            roomId={room.id}
            canManage={false}
          />
        </div>

        <div className="min-w-0 space-y-5">
        <div className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-[#4f321e]">Thông tin phòng</h2>

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <InfoItem label="Giá" value={formatMoney(room.price)} />
          <div>
            <p className="text-sm text-gray-500">Trạng thái phòng</p>
            {canManage === true && !isArchived ? (
              <div className="mt-3">
                <RoomStatusControl
                  roomId={room.id}
                  currentStatus={room.status}
                />
              </div>
            ) : (
              <p className="mt-1 font-semibold text-[#4d3422]">{room.displayStatus}</p>
            )}

            {room.displayStatus === "Sắp trống" &&
            room.daysRemaining !== null ? (
              <p className="mt-2 text-sm text-orange-500">
                Còn {room.daysRemaining} ngày
              </p>
            ) : null}
          </div>
          <InfoItem label="Loại phòng" value={room.room_type || "-"} />
          <InfoItem label="Địa chỉ" value={fullAddress} />
        </div>

        {room.description ? (
          <div className="mt-6 border-t pt-5">
            <p className="text-sm text-gray-500">Mô tả</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#5f4631]">
              {room.description}
            </p>
          </div>
        ) : null}
        </div>
        <RoomDetailsSummary details={room.details} policy={room.chinh_sach} />
        </div>
      </div>

      <TenantRosterCard
        tenants={tenants}
        roomId={room.id}
        canManage={canManage === true}
        isArchived={isArchived}
      />

      <div className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#4f321e]">Hợp đồng hiện tại</h2>
          {contract?.id ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#80634a]">
                Xem chi tiết HĐ:
              </span>
              <Link
                href={`/owner/contracts/${contract.id}`}
                aria-label="Mở chi tiết hợp đồng hiện tại"
                title="Mở chi tiết hợp đồng hiện tại"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#744722] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#633b1d] hover:shadow-md"
              >
                <KeyRound size={17} />
              </Link>
            </div>
          ) : null}
        </div>

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
  details: Awaited<ReturnType<typeof getRoomDetail>>["details"];
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
    details?.free_time && "Giờ giấc tự do",
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
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-4 shadow-[0_14px_35px_rgba(92,61,34,0.08)] sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-[#4f321e]">Chi phí và tiện nghi</h2>

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
        <p className="text-sm text-[#80634a]">Chưa khai báo chi phí dịch vụ.</p>
      )}

      {amenities.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {amenities.map((amenity) => (
            <span
              key={amenity}
              className="rounded-full bg-[#eadbc8] px-3 py-1 text-xs font-medium text-[#684324]"
            >
              {amenity}
            </span>
          ))}
        </div>
      ) : null}

      {details?.other_amenities ? (
        <p className="mt-5 whitespace-pre-wrap text-sm text-[#5f4631]">
          <strong>Tiện nghi khác:</strong> {details.other_amenities}
        </p>
      ) : null}

      {policy ? (
        <p className="mt-5 whitespace-pre-wrap border-t border-[#b58f69]/20 pt-4 text-sm text-[#5f4631]">
          <strong>Chính sách:</strong> {policy}
        </p>
      ) : null}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-[#80634a]">{label}</p>
      <p className="font-semibold text-[#4d3422]">{value}</p>
    </div>
  );
}

function formatFullAddress(...parts: Array<string | null | undefined>) {
  const addressParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return addressParts.length > 0 ? addressParts.join(", ") : "-";
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
