import RoomStatusHistory from "@/components/owner/RoomStatusHistory";
import { getRoomStatusLogs } from "@/lib/owner/getRoomStatusLogs";

export default async function RoomStatusHistorySection({
  roomId,
}: {
  roomId: string;
}) {
  const logs = await getRoomStatusLogs(roomId);
  return <RoomStatusHistory logs={logs} />;
}
