import { supabase } from "@/lib/supabase";

const ROOM_DETAIL_PREFETCH_TTL_MS = 15_000;

type CachedRoomDetail = {
  createdAt: number;
  promise: Promise<any | null>;
};

const roomDetailCache = new Map<string, CachedRoomDetail>();

export function loadRoomDetailFast(roomId: string) {
  const id = String(roomId ?? "").trim();
  if (!id) return Promise.resolve(null);

  const cached = roomDetailCache.get(id);
  if (cached && Date.now() - cached.createdAt < ROOM_DETAIL_PREFETCH_TTL_MS) {
    return cached.promise;
  }

  const promise = Promise.resolve(
    supabase.rpc("fetch_room_detail_full_v1", { p_id: id, p_role: 0 }),
  )
    .then(({ data, error }) => {
      if (error) throw error;
      return data ?? null;
    })
    .catch((error) => {
      roomDetailCache.delete(id);
      throw error;
    });

  roomDetailCache.set(id, { createdAt: Date.now(), promise });
  return promise;
}

export function prefetchRoomDetail(roomId: string) {
  void loadRoomDetailFast(roomId).catch(() => {
    // Navigation vẫn tự thử tải lại nếu prefetch tạm thời thất bại.
  });
}
