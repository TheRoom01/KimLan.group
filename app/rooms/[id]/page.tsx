import { notFound } from "next/navigation";

import RoomDetailClient from "./RoomDetailClient";
import { getPublicRoomDetail } from "@/lib/rooms/publicCache";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const room = await getPublicRoomDetail(id);

  if (!room) notFound();

  return <RoomDetailClient roomId={id} initialRoom={room} />;
}
