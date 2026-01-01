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
  loading,
}: RoomListProps) => {
  if (fetchError) {
    return (
      <main className="container mx-auto px-4 pb-10">
        <div className="py-6 text-red-600">{fetchError}</div>
      </main>
    );
  }

  const shouldShowSkeleton = showSkeleton || (loading && roomsToRender.length === 0);

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
          {roomsToRender.map((room) => (
            <RoomCard key={room.id} room={room} adminLevel={adminLevel} />
          ))}
        </div>
      ) : (
        <div className="py-6 text-gray-600">Không có phòng phù hợp.</div>
      )}
    </main>
  );
};

export default RoomList;
