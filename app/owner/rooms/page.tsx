import RoomCard from "@/components/owner/RoomCard";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";

export default async function RoomsPage() {
  const rooms = await getOwnerRooms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Danh sách phòng</h1>
        <p className="text-gray-500">
          Tổng cộng: {rooms.length} phòng
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-gray-500">
          Chưa có phòng thuộc các tòa nhà bạn quản lý.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room: any) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
