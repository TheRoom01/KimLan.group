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
  onNavigate: (href: string) => void;
  isRefreshing?: boolean;
};

const RoomList = ({
  fetchError,
  showSkeleton,
  roomsToRender,
  adminLevel,
  onNavigate,
  isRefreshing = false,
}: RoomListProps) => {
  if (fetchError) {
    return (
      <main className="container mx-auto px-4 pb-10">
        <div className="py-6 text-red-600">{fetchError}</div>
      </main>
    );
  }

  const hasRooms = roomsToRender.length > 0;
  const showInitialSkeleton = showSkeleton && !hasRooms;

  return (
    <main className="w-full max-w-screen-2xl mx-auto px-4 pb-24">
      {isRefreshing && hasRooms && (
        <div className="mb-3 text-sm text-gray-500">Đang cập nhật danh sách...</div>
      )}

      {showInitialSkeleton ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : hasRooms ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {roomsToRender.map((room, index) => (
            <RoomCard
              key={room.id}
              room={room}
              adminLevel={adminLevel}
              index={index}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : (
        <div className="py-6 text-gray-600">Không có phòng phù hợp.</div>
      )}
    </main>
  );
};

export default RoomList;