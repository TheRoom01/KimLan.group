import React from "react";
import RoomCard from "@/components/RoomCard";
import RoomCardSkeleton from "@/components/RoomCardSkeleton";

type RoomListProps = {
  fetchError: string;
  showSkeleton: boolean;
  roomsToRender: any[];
  adminLevel: 0 | 1 | 2;
  pageIndex: number;
  loading: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
};

const RoomList = ({
  fetchError,
  showSkeleton,
  roomsToRender,
  adminLevel,
}: RoomListProps) => {
  if (fetchError) {
    return (
      <main className="container mx-auto px-4 pb-10">
        <div className="py-6 text-red-600">{fetchError}</div>
      </main>
    );
  }

  // ✅ Đồng bộ với HomeClient: phân biệt "chưa fetch" (showSkeleton=true) vs "đã fetch nhưng rỗng" (roomsToRender=[])
  // -> RoomList KHÔNG tự suy luận từ `loading && roomsToRender.length===0` nữa để tránh kẹt Skeleton
  const shouldShowSkeleton = showSkeleton;

  return (
    <main className="container mx-auto px-4 pb-10">
      {shouldShowSkeleton ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : roomsToRender.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roomsToRender.map((room, index) => (
            <RoomCard key={room.id} room={room} adminLevel={adminLevel} index={index} />
          ))}

        </div>
      ) : (
        <div className="py-6 text-gray-600">Không có phòng phù hợp.</div>
      )}
    </main>
  );
};

export default RoomList;
