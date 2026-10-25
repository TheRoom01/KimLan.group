import type { SupabaseClient } from "@supabase/supabase-js";

export const ROOM_BADGES = [
  { id: "budget_friendly", label: "Phòng giá rẻ", className: "border-emerald-300/50 bg-emerald-950/70 text-emerald-100" },
  { id: "new_listing", label: "Nhà mới", className: "border-sky-300/50 bg-sky-950/70 text-sky-100" },
  { id: "featured", label: "Phòng đẹp", className: "border-pink-200/70 bg-pink-700/85 text-pink-50" },
  { id: "exclusive", label: "Độc quyền", className: "border-violet-300/50 bg-violet-950/75 text-violet-100" },
] as const;

export type RoomBadge = (typeof ROOM_BADGES)[number]["id"];

const ROOM_BADGE_IDS = new Set<string>(ROOM_BADGES.map(({ id }) => id));

export function normalizeRoomBadges(value: unknown): RoomBadge[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value.filter((item): item is RoomBadge => typeof item === "string" && ROOM_BADGE_IDS.has(item)));
  return ROOM_BADGES.filter((badge) => selected.has(badge.id)).map((badge) => badge.id);
}

export function roomBadgeLabel(id: string) {
  return ROOM_BADGES.find((badge) => badge.id === id)?.label ?? "";
}

export async function attachRoomBadges<T extends { id?: string | null }>(
  supabase: Pick<SupabaseClient, "rpc">,
  rooms: T[],
): Promise<Array<T & { badges: RoomBadge[] }>> {
  // The cursor RPC includes badges after its migration has been applied.
  // Reuse them directly instead of making a second round trip for every page.
  if (rooms.every((room) => Array.isArray((room as any).badges))) {
    return rooms.map((room) => ({ ...room, badges: normalizeRoomBadges((room as any).badges) }));
  }

  const ids = Array.from(new Set(rooms.map((room) => String(room.id ?? "").trim()).filter(Boolean)));
  if (!ids.length) return rooms.map((room) => ({ ...room, badges: normalizeRoomBadges((room as any).badges) }));

  // The RPC intentionally caps inputs to 50 IDs. Admin lists can be larger,
  // so fetch bounded batches and retain fallback data if one batch fails.
  const byRoom = new Map<string, RoomBadge[]>();
  let failed = false;
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const { data, error } = await supabase.rpc("get_room_badges_v1", { p_room_ids: batch });
    if (error) {
      failed = true;
      continue;
    }
    for (const item of (data ?? []) as Array<{ room_id?: string; badges?: unknown }>) {
      if (item.room_id) byRoom.set(String(item.room_id), normalizeRoomBadges(item.badges));
    }
  }

  if (failed) {
    // Keep this generic: do not expose database errors or any request data.
    console.warn("Could not load some room badges; confirm the room badge migration is applied.");
  }

  return rooms.map((room) => {
    const id = String(room.id ?? "");
    return { ...room, badges: byRoom.get(id) ?? normalizeRoomBadges((room as any).badges) };
  });
}
