import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  fetchRoomsServer,
  type FetchRoomsParams,
} from "@/lib/fetchRoomsServer";

export const PUBLIC_ROOMS_CACHE_TAG = "public-rooms-v1";

export function publicRoomCacheTag(roomId: string) {
  return `public-room-v1:${roomId}`;
}

function createPublicSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export const getPublicRoomDetail = cache(async (roomId: string) => {
  const id = String(roomId ?? "").trim();
  if (!id) return null;

  return unstable_cache(
    async () => {
      const supabase = createPublicSupabaseClient();
      const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
        p_id: id,
        p_role: 0,
      });

      if (error) throw new Error(error.message);
      return data ?? null;
    },
    ["public-room-detail-v1", id],
    {
      revalidate: 60,
      tags: [publicRoomCacheTag(id)],
    },
  )();
});

export const getCachedPublicRooms = cache(async (params: FetchRoomsParams) => {
  const normalizedParams: FetchRoomsParams = { ...params, adminLevel: 0 };
  const cacheKey = JSON.stringify(normalizedParams);

  return unstable_cache(
    async () => {
      const supabase = createPublicSupabaseClient();
      const { data: anonSessionId, error: anonSessionError } =
        await supabase.rpc("start_anon_session", { p_session_id: null });

      if (anonSessionError || !anonSessionId) {
        throw new Error(
          anonSessionError?.message || "Không thể khởi tạo phiên xem phòng",
        );
      }

      const result = await fetchRoomsServer(supabase, {
        ...normalizedParams,
        anonSessionId: String(anonSessionId),
      });

      if (result.error) throw new Error(result.error);
      return result;
    },
    ["public-room-list-v1", cacheKey],
    {
      revalidate: 30,
      tags: [PUBLIC_ROOMS_CACHE_TAG],
    },
  )();
});
