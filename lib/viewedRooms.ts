export const VIEWED_ROOMS_KEY = "viewed_room_ids_v1";
export const VIEWED_ROOMS_CHANGED_EVENT = "viewed-rooms-changed";

const MAX_VIEWED_ROOMS = 500;
const VIEWED_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ViewedRoomEntry = {
  id: string;
  viewedAt: number;
};

function getViewedRoomEntries(): ViewedRoomEntry[] {
  const raw = localStorage.getItem(VIEWED_ROOMS_KEY);
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) return [];

  const now = Date.now();
  return parsed
    .map((entry): ViewedRoomEntry | null => {
      if (typeof entry === "string" && entry) return { id: entry, viewedAt: now };
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<ViewedRoomEntry>;
      return typeof candidate.id === "string" && candidate.id && typeof candidate.viewedAt === "number"
        ? { id: candidate.id, viewedAt: candidate.viewedAt }
        : null;
    })
    .filter((entry): entry is ViewedRoomEntry => entry !== null)
    .filter((entry) => now - entry.viewedAt < VIEWED_ROOM_TTL_MS)
    .slice(0, MAX_VIEWED_ROOMS);
}

export function getViewedRoomIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const entries = getViewedRoomEntries();
    localStorage.setItem(VIEWED_ROOMS_KEY, JSON.stringify(entries));
    return entries.map((entry) => entry.id);
  } catch {
    return [];
  }
}

export function markRoomViewed(roomId: string) {
  if (typeof window === "undefined" || !roomId) return;

  try {
    const next = [{ id: roomId, viewedAt: Date.now() }, ...getViewedRoomEntries().filter((entry) => entry.id !== roomId)]
      .slice(0, MAX_VIEWED_ROOMS);
    localStorage.setItem(VIEWED_ROOMS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(VIEWED_ROOMS_CHANGED_EVENT));
  } catch {
    // Viewing a room must keep working even when storage is unavailable.
  }
}

export function clearViewedRooms() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(VIEWED_ROOMS_KEY);
    window.dispatchEvent(new Event(VIEWED_ROOMS_CHANGED_EVENT));
  } catch {
    // The map remains usable when storage is unavailable.
  }
}
