import "server-only";

import { revalidateTag } from "next/cache";

import {
  PUBLIC_ROOMS_CACHE_TAG,
  publicRoomCacheTag,
} from "@/lib/rooms/publicCache";

export function invalidatePublicRoomCache(roomId?: string | null) {
  revalidateTag(PUBLIC_ROOMS_CACHE_TAG, { expire: 0 });

  const id = String(roomId ?? "").trim();
  if (id) revalidateTag(publicRoomCacheTag(id), { expire: 0 });
}
