import Link from "next/link";

import EditRoomForm from "@/components/owner/EditRoomForm";
import { getRoomDetail } from "@/lib/owner/getRoomDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return <ErrorCard message="Mã phòng không hợp lệ." />;
  }

  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    { data: canManage, error: permissionError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("can_manage_room", { p_room_id: id }),
  ]);

  if (!user) {
    return <ErrorCard message="Bạn cần đăng nhập để chỉnh sửa phòng." />;
  }

  if (permissionError || canManage !== true) {
    return <ErrorCard message="Bạn không có quyền chỉnh sửa phòng này." />;
  }

  const room = await getRoomDetail(id);

  if (room.lifecycle_status === "archived") {
    return (
      <ErrorCard
        message="Phòng đã được lưu trữ và không thể chỉnh sửa tại Owner Portal."
        href={`/owner/rooms/${room.id}`}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Chỉnh sửa phòng {room.room_code}
          </h1>
          <p className="mt-1 text-gray-500">
            Cập nhật thông tin, phí, tiện nghi, trạng thái xuất bản và media.
          </p>
        </div>

        <Link
          href={`/owner/rooms/${room.id}`}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-100"
        >
          ← Quay lại
        </Link>
      </div>

      <EditRoomForm room={room} />
    </div>
  );
}

function ErrorCard({
  message,
  href = "/owner/rooms",
}: {
  message: string;
  href?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
      <p className="text-gray-700">{message}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        Quay lại
      </Link>
    </div>
  );
}
