"use server";

import { interpretRoomSearch } from "@/lib/rooms/interpretRoomSearch";

export async function interpretHomeSearch(query: string) {
  return interpretRoomSearch(query);
}
