// CDN room media is already compressed WebP with long-lived browser caching.
// Opt in only after Vercel Image Optimization billing/availability is verified.
const cardImageHosts = new Set([
  'pub-199f69de3cc14666947ff30edf3886a7.r2.dev',
  'cdn.canhodichvu.pro',
  'scjzycloubqarxxvqohu.supabase.co',
]);

export function canOptimizeRoomCardImage(
  src: string,
  enabled = process.env.NEXT_PUBLIC_ROOM_CARD_IMAGE_OPTIMIZATION === 'true',
) {
  // Local placeholders must remain available even if the optimizer is blocked.
  if (!enabled || src.startsWith('/')) return false;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && cardImageHosts.has(url.hostname);
  } catch { return false; }
}

type RoomImageMedia = {
  id?: string | null;
  type?: string | null;
  kind?: string | null;
  url?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};

export function compareRoomMediaOrder(left: RoomImageMedia, right: RoomImageMedia) {
  const order =
    (left.sort_order ?? Number.POSITIVE_INFINITY) -
    (right.sort_order ?? Number.POSITIVE_INFINITY);
  if (order) return order;

  const leftTime = left.created_at ? Date.parse(left.created_at) : Number.POSITIVE_INFINITY;
  const rightTime = right.created_at ? Date.parse(right.created_at) : Number.POSITIVE_INFINITY;
  const time = leftTime - rightTime;
  if (time) return time;
  // PostgreSQL timestamps can distinguish microseconds within one JS millisecond.
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    const micros = (value: string | null | undefined) =>
      Number((value?.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
    const difference = micros(left.created_at) - micros(right.created_at);
    if (difference) return difference;
  }
  return (left.id ?? "").localeCompare(right.id ?? "");
}

export function getFullImageUrls(room: {
  media?: RoomImageMedia[] | null;
  image_urls?: string[] | null;
}, deduplicate = true): string[] {
  const images = Array.isArray(room.media)
    ? room.media.filter(item =>
        (item?.type ?? item?.kind)?.toLowerCase() === "image" && item.url?.trim()
      ).sort(compareRoomMediaOrder).map(item => item.url!.trim())
    : [];
  const urls = images.length ? images : (room.image_urls ?? []).map(url => url?.trim()).filter(Boolean);
  return deduplicate ? [...new Set(urls)] : urls;
}
