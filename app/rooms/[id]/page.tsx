import { notFound } from "next/navigation";

import RoomDetailClient from "./RoomDetailClient";
import { getRoomDetailForRender } from "@/lib/rooms/publicCache";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getRoomDetailForRender(id);
  const room = detail.room;

  if (!room) notFound();

  return (
    <RoomDetailClient
      key={id}
      roomId={id}
      initialRoom={room}
      initialUserId={detail.initialUserId}
      initialAdminLevel={detail.initialAdminLevel}
      initialAuthResolved={detail.initialAuthResolved}
      privateDetailLoaded={detail.privateDetailLoaded}
    />
  );
}
