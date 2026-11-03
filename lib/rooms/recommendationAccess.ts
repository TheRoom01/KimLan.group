import type { SupabaseClient } from "@supabase/supabase-js";

type RoomAddress = { id: string; house_number?: string | null };

// The recommendation RPC is public-only. Hydrate only the house-number field
// after validating the cookie session and looking up the real L1/L2 membership.
// Neither a client-supplied adminLevel nor user_metadata grants this access.
export async function recommendationRoomsForViewer<T extends RoomAddress>(
  rooms: T[],
  viewer: SupabaseClient,
  server: SupabaseClient,
): Promise<T[]> {
  if (!rooms.length) return rooms;
  const { data: { user }, error: authError } = await viewer.auth.getUser();
  if (authError || !user) return rooms;

  const { data: membership, error: membershipError } = await server
    .from("admin_users").select("level").eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new Error("Cannot verify recommendation address access");
  if (membership?.level !== 1 && membership?.level !== 2) return rooms;

  // One bounded batch for the public rooms already selected by the RPC.
  const ids = [...new Set(rooms.map(room => room.id))].slice(0, 10);
  const { data: addresses, error: addressError } = await server
    .from("rooms").select("id,house_number").in("id", ids);
  if (addressError) throw new Error("Cannot load recommendation addresses");
  const byId = new Map<string, string | null>(
    (addresses ?? []).map(row => [String(row.id), row.house_number ?? null]),
  );
  return rooms.map(room => byId.has(room.id) ? { ...room, house_number: byId.get(room.id) } : room);
}
