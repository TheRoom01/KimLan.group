import Link from "next/link";
import { getRoomDetail } from "../../../../lib/owner/getRoomDetail";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const room = await getRoomDetail(id);

  const contract = room.contract;
  const tenant = room.tenant;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">

        <div>

            <h1 className="text-3xl font-bold">
            Phòng {room.room_code}
            </h1>

            <p className="text-gray-500">
            {room.address}
            </p>

            <p className="text-sm text-gray-400">
            {room.ward} • {room.district}
            </p>

        </div>

        <Link
            href={`/owner/properties/${room.property_id}`}
            className="rounded-lg border px-4 py-2 hover:bg-gray-100"
        >
            ← Quay lại
        </Link>

        </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Thông tin phòng
        </h2>

        <div className="grid grid-cols-2 gap-6">

          <div>
            <p className="text-gray-500">Giá</p>

            <p className="font-semibold">
              {room.price?.toLocaleString("vi-VN")} đ
            </p>
          </div>

          <div>
            <p className="text-gray-500">Trạng thái</p>

            <div>
                <p className="font-semibold">

                    {room.displayStatus}

                </p>

                {room.displayStatus === "Sắp trống" &&
                    room.daysRemaining !== null && (

                    <p className="text-sm text-orange-500">

                        Còn {room.daysRemaining} ngày

                    </p>

                )}
            </div>
          </div>

          <div>
            <p className="text-gray-500">Loại phòng</p>

            <p>{room.room_type}</p>
          </div>

          <div>
            <p className="text-gray-500">Địa chỉ</p>

            <p>{room.address}</p>
          </div>

        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Khách thuê
        </h2>

        {tenant ? (
          <div className="space-y-2">
            <p><strong>Họ tên:</strong> {tenant.full_name}</p>
            <p><strong>SĐT:</strong> {tenant.phone}</p>
            <p><strong>CCCD:</strong> {tenant.cccd ?? "-"}</p>
          </div>
        ) : (
          <p>Chưa có khách thuê.</p>
        )}
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Hợp đồng
        </h2>

        {contract ? (
          <div className="space-y-2">
            <p>
            <strong>Bắt đầu:</strong>{" "}
            {new Date(contract.start_date).toLocaleDateString("vi-VN")}
            </p>

            <p>
            <strong>Kết thúc:</strong>{" "}
            {new Date(contract.end_date).toLocaleDateString("vi-VN")}
            </p>

            <p>
            <strong>Tiền thuê:</strong>{" "}
            {contract.monthly_price?.toLocaleString("vi-VN")} đ
            </p>

            <p>
            <strong>Tiền cọc:</strong>{" "}
            {contract.deposit_amount?.toLocaleString("vi-VN")} đ
            </p>

            <p>
            <strong>Trạng thái:</strong>{" "}
            {contract.status}
            </p>
          </div>
        ) : (
          <p>Chưa có hợp đồng.</p>
        )}
      </div>
    </div>
  );
}