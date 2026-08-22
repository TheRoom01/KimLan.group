export const VIEWED_ROOMS_KEY = "viewed_room_ids_v1";
export const VIEWED_ROOMS_CHANGED_EVENT = "viewed-rooms-changed";

const MAX_VIEWED_ROOMS = 500;

export function getViewedRoomIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(VIEWED_ROOMS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
  } catch {
    return [];
  }
}

export function markRoomViewed(roomId: string) {
  if (typeof window === "undefined" || !roomId) return;

  try {
    const next = [roomId, ...getViewedRoomIds().filter((id) => id !== roomId)]
      .slice(0, MAX_VIEWED_ROOMS);
    localStorage.setItem(VIEWED_ROOMS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(VIEWED_ROOMS_CHANGED_EVENT));
  } catch {
    // Viewing a room must keep working even when storage is unavailable.
  }
}
