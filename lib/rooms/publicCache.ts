import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import {
  fetchRoomsServer,
  type FetchRoomsParams,
} from "@/lib/fetchRoomsServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachRoomBadges } from "@/lib/roomBadges";
import { getAnonymousHomeAccess } from "@/lib/rooms/anonymousHomeAccess";

export const PUBLIC_ROOMS_CACHE_TAG = "public-rooms-v1";

export function publicRoomCacheTag(roomId: string) {
  return `public-room-v1:${roomId}`;
}

export const getPublicRoomDetail = cache(async (roomId: string) => {
  const id = String(roomId ?? "").trim();
  const anonymous = await getAnonymousHomeAccess();
  if (!id || !anonymous || anonymous.expired) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", { p_id: id, p_role: 0 });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return data ?? null;
  return (await attachRoomBadges(supabase, [data as Record<string, any>]))[0] ?? data;
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
          const room = (await attachRoomBadges(supabase, [data as Record<string, any>]))[0] ?? data;
          return {
            room,
            initialUserId: userId,
            initialAdminLevel: adminLevel,
            initialAuthResolved: true,
            privateDetailLoaded: true,
          };
        }
      } else {
        const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
          p_id: id,
          p_role: 0,
        });
        const room = !error && data
          ? (await attachRoomBadges(supabase, [data as Record<string, any>]))[0] ?? data
          : null;
        return {
          room,
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

export const getCachedPublicRooms = cache(async (params: FetchRoomsParams, anonSessionId: string) => {
  const normalizedParams: FetchRoomsParams = { ...params, adminLevel: 0 };
  const anonymous = await getAnonymousHomeAccess();
  if (!anonymous || anonymous.expired || anonymous.sessionId !== anonSessionId) {
    return { data: [], nextCursor: null, total: 0, error: "Phiên xem phòng không hợp lệ" };
  }
  const supabase = createSupabaseAdminClient();
  const result = await fetchRoomsServer(supabase, { ...normalizedParams, anonSessionId });
  if (result.error) throw new Error(result.error);
  return result;
});
