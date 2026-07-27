import Link from "next/link";

import RoomCard from "@/components/owner/RoomCard";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";

type RoomsPageProps = {
  searchParams?: Promise<{
    status?: string | string[];
  }>;
};

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const params = searchParams ? await searchParams : {};
  const statusValue = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const onlyEmpty = statusValue === "empty";

  const allRooms = await getOwnerRooms();
  const rooms = onlyEmpty
    ? allRooms.filter((room: any) => room.displayStatus === "Đang trống")
    : allRooms;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6547]">
            Quản lý phòng
          </p>
          <h1 className="mt-1 break-words text-2xl font-bold text-[#432918] sm:text-3xl">
            {onlyEmpty ? "Phòng đang trống" : "Danh sách phòng"}
          </h1>
          <p className="mt-1 text-sm text-[#7f6651]">
            {onlyEmpty
              ? `${rooms.length} phòng trống thuộc các tòa nhà bạn đang quản lý`
              : `Tổng cộng: ${rooms.length} phòng thuộc các tòa nhà bạn đang quản lý`}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link
            href="/owner/rooms"
            className={`inline-flex min-w-0 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
              onlyEmpty
                ? "border border-[#9a704b]/30 bg-[#fff8ed] text-[#684324] hover:bg-[#f3e1c9]"
                : "bg-[#744722] text-[#fff8eb]"
            }`}
          >
            Tất cả phòng
          </Link>
          <Link
            href="/owner/rooms?status=empty"
            className={`inline-flex min-w-0 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
              onlyEmpty
                ? "bg-[#744722] text-[#fff8eb]"
                : "border border-[#9a704b]/30 bg-[#fff8ed] text-[#684324] hover:bg-[#f3e1c9]"
            }`}
          >
            Phòng trống
          </Link>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="min-w-0 rounded-2xl border border-dashed border-[#a9825f]/35 bg-[#fff8ed] px-5 py-10 text-center text-sm text-[#7d624b]">
          {onlyEmpty
            ? "Hiện không có phòng trống trong các tòa nhà bạn đang quản lý."
            : "Chưa có phòng thuộc các tòa nhà bạn quản lý."}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rooms.map((room: any) => (
            <div key={room.id} className="min-w-0">
              <RoomCard room={room} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
