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
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-10">
        <div className="rounded-[15px] border border-red-400/25 bg-red-950/25 px-4 py-3 text-sm text-red-200 backdrop-blur-[20px]">
          {fetchError}
        </div>
      </main>
    );
  }

  const hasRooms = roomsToRender.length > 0;
  const showInitialSkeleton = showSkeleton && !hasRooms;

  return (
    <main className="relative z-0 mx-auto w-full max-w-[1240px] px-4 md:px-6 pb-36 pt-2">
      {isRefreshing && hasRooms && (
        <div className="mb-3 rounded-[15px] border border-[rgba(197,165,130,0.16)] bg-[rgba(45,27,20,0.35)] px-4 py-2 text-sm text-[#A0856E] backdrop-blur-[20px]">
          Đang cập nhật danh sách...
        </div>
      )}

      {showInitialSkeleton ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : hasRooms ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        <div className="rounded-[15px] border border-[rgba(197,165,130,0.16)] bg-[rgba(45,27,20,0.35)] px-4 py-5 text-center text-sm text-[#E5C9A9] backdrop-blur-[20px]">
          Không có phòng phù hợp.
        </div>
      )}
    </main>
  );
};

export default RoomList;