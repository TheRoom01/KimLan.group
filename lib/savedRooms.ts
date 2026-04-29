export const SAVED_ROOMS_KEY = "saved_room_ids";

export function getSavedRoomIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(SAVED_ROOMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isRoomSaved(roomId: string): boolean {
  return getSavedRoomIds().includes(roomId);
}

export function toggleSavedRoom(roomId: string): boolean {
  const ids = getSavedRoomIds();
  const exists = ids.includes(roomId);

  const next = exists
    ? ids.filter((id) => id !== roomId)
    : [roomId, ...ids];

  localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("saved-rooms-changed"));

  return !exists;
}