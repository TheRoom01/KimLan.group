import sharp from "sharp";
import { isHomeCoverWidth, isResizableHomeCover } from "@/lib/rooms/homeCover";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get("src") ?? "";
  const width = Number(searchParams.get("w"));
  if (!isResizableHomeCover(src) || !isHomeCoverWidth(width)) {
    return new Response(null, { status: 400 });
  }

  try {
    const source = await fetch(src, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const size = Number(source.headers.get("content-length"));
    if (!source.ok || size <= 0 || size > MAX_BYTES || !source.headers.get("content-type")?.startsWith("image/")) {
      await source.body?.cancel();
      return new Response(null, { status: 502 });
    }
    const bytes = await source.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response(null, { status: 502 });

    const cover = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return new Response(new Uint8Array(cover), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
