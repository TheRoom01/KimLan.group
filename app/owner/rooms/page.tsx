import OwnerRoomsDashboard from "@/components/owner/OwnerRoomsDashboard";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";

export default async function RoomsPage() {
  const rooms = await getOwnerRooms();
  return <OwnerRoomsDashboard rooms={rooms} />;
}
