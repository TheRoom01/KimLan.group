import React from "react";
import RoomCard from "@/components/RoomCard";
import RoomCardSkeleton from "@/components/RoomCardSkeleton";

const ROOM_GRID_STYLE: React.CSSProperties = {
  gridTemplateColumns:
    "repeat(auto-fill, minmax(min(100%, 360px), 440px))",
  justifyContent: "center",
  alignItems: "start",
  gap: "clamp(14px, 1.2vw, 22px)",
};

type RoomListProps = {
  fetchError: string;
  showSkeleton: boolean;
  roomsToRender: any[];
  adminLevel: 0 | 1 | 2;
  currentUserId?: string | null;
  currentAdminPhone?: string | null;
  currentAdminName?: string | null;
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
  currentUserId,
  currentAdminPhone,
  currentAdminName,
  onNavigate,
  isRefreshing = false,
}: RoomListProps) => {
  if (fetchError) {
    return (
      <main className="w-full max-w-none px-2 sm:px-3 lg:px-4 pb-10">
        <div className="rounded-[15px] border border-red-400/25 bg-red-950/25 px-4 py-3 text-sm text-red-200 backdrop-blur-[20px]">
          {fetchError}
        </div>
      </main>
    );
  }

  const hasRooms = roomsToRender.length > 0;
  const showInitialSkeleton = showSkeleton && !hasRooms;

  return (
    <main className="relative z-0 w-full max-w-none px-2 sm:px-3 lg:px-4 pb-36 pt-2">
      {isRefreshing && hasRooms && (
        <div className="mb-3 rounded-[15px] border border-[rgba(197,165,130,0.16)] bg-[rgba(45,27,20,0.35)] px-4 py-2 text-sm text-[#A0856E] backdrop-blur-[20px]">
          Đang cập nhật danh sách...
        </div>
      )}

      {showInitialSkeleton ? (
        <div className="grid w-full" style={ROOM_GRID_STYLE}>
          {Array.from({ length: 12 }).map((_, i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : hasRooms ? (
        <div className="grid w-full" style={ROOM_GRID_STYLE}>
          {roomsToRender.map((room, index) => (
            <RoomCard
              key={room.id}
              room={room}
              adminLevel={adminLevel}
              currentUserId={currentUserId}
              currentAdminPhone={currentAdminPhone}
              currentAdminName={currentAdminName}
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