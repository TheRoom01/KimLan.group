export type OwnerRoomCardSize = { width: number; height: number };
export type OwnerRoomCardSizes = Record<string, OwnerRoomCardSize>;

export const DEFAULT_OWNER_ROOM_CARD_SIZE: OwnerRoomCardSize = {
  width: 150,
  height: 76,
};

export const OWNER_ROOM_CARD_LIMITS = {
  minWidth: 120,
  maxWidth: 300,
  minHeight: 76,
  maxHeight: 240,
};

export const OWNER_ROOM_CARD_SIZE_STORAGE_KEY = "owner-room-card-sizes-v1";

export function clampOwnerRoomCardSize(
  size?: Partial<OwnerRoomCardSize> | null,
): OwnerRoomCardSize {
  const width = Number(size?.width) || DEFAULT_OWNER_ROOM_CARD_SIZE.width;
  const height = Number(size?.height) || DEFAULT_OWNER_ROOM_CARD_SIZE.height;

  return {
    width: Math.min(
      OWNER_ROOM_CARD_LIMITS.maxWidth,
      Math.max(OWNER_ROOM_CARD_LIMITS.minWidth, width),
    ),
    height: Math.min(
      OWNER_ROOM_CARD_LIMITS.maxHeight,
      Math.max(OWNER_ROOM_CARD_LIMITS.minHeight, height),
    ),
  };
}
