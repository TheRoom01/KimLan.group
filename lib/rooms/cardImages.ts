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
