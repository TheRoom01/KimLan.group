import type { ImageLoaderProps } from "next/image";

const coverOrigins = new Set([
  "https://cdn.canhodichvu.pro",
  "https://pub-199f69de3cc14666947ff30edf3886a7.r2.dev",
]);

export function isResizableHomeCover(src: string) {
  try {
    const url = new URL(src);
    return coverOrigins.has(url.origin) && !url.username && !url.password && !url.search && !url.hash
      && /^\/rooms\/[\w-]+\/images\/[\w.-]+\.(?:webp|jpe?g|png|avif)$/i.test(url.pathname)
      && !url.pathname.endsWith("/thumb.webp");
  } catch {
    return false;
  }
}

const coverWidths = [256, 384, 512, 640, 768, 960, 1280, 1600];
export function isHomeCoverWidth(width: number) {
  return coverWidths.includes(width);
}

export function homeCoverLoader({ src, width }: ImageLoaderProps) {
  const nearest = coverWidths.find(candidate => candidate >= width) ?? 1600;
  return `/api/home-cover?src=${encodeURIComponent(src)}&w=${nearest}`;
}
