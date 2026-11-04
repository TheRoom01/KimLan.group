// Match next.config.ts image hosts. Unknown legacy hosts keep their existing
// direct-loading behavior instead of failing the Next image host allowlist.
const cardImageHosts = new Set([
  'pub-199f69de3cc14666947ff30edf3886a7.r2.dev',
  'cdn.canhodichvu.pro',
  'scjzycloubqarxxvqohu.supabase.co',
]);

export function canOptimizeRoomCardImage(src: string) {
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && cardImageHosts.has(url.hostname);
  } catch { return false; }
}
