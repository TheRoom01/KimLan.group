import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";

import {
  fetchRoomsServer,
  type FetchRoomsParams,
} from "@/lib/fetchRoomsServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export const getRoomDetailForRender = cache(async (roomId: string) => {
  const id = String(roomId ?? "").trim();
  if (!id) {
    return {
      room: null,
      initialUserId: null,
      initialAdminLevel: 0 as const,
      initialAuthResolved: false,
      privateDetailLoaded: false,
    };
  }

  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));

  if (hasAuthCookie) {
    const supabase = await createSupabaseServerClient();
    const [{ data: claimsData, error: claimsError }, { data: levelData, error: levelError }] =
      await Promise.all([
        supabase.auth.getClaims(),
        supabase.rpc("get_my_admin_level"),
      ]);

    const userId = String(claimsData?.claims?.sub ?? "").trim();
    const rawLevel = Number(levelData ?? 0);
    const adminLevel: 0 | 1 | 2 =
      !levelError && (rawLevel === 1 || rawLevel === 2) ? rawLevel : 0;

    if (!claimsError && userId && !levelError) {
      if (adminLevel === 1 || adminLevel === 2) {
        const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
          p_id: id,
          // The RPC derives the effective role from auth.uid(); this value is not
          // used as an authorization claim.
          p_role: 0,
        });

        if (!error && data) {
          return {
            room: data,
            initialUserId: userId,
            initialAdminLevel: adminLevel,
            initialAuthResolved: true,
            privateDetailLoaded: true,
          };
        }
      } else {
        return {
          room: await getPublicRoomDetail(id),
          initialUserId: userId,
          initialAdminLevel: 0 as const,
          initialAuthResolved: true,
          privateDetailLoaded: false,
        };
      }
    }
  }

  return {
    room: await getPublicRoomDetail(id),
    initialUserId: null,
    initialAdminLevel: 0 as const,
    initialAuthResolved: false,
    privateDetailLoaded: false,
  };
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
