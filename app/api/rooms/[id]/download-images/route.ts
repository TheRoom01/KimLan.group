import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function splitGalleryUrls(gallery_urls: any): string[] {
  if (!gallery_urls) return [];
  if (Array.isArray(gallery_urls)) return gallery_urls.filter(Boolean);

  // Trong repo, gallery_urls đang được split bằng dấu "," :contentReference[oaicite:1]{index=1}
  if (typeof gallery_urls === "string") {
    return gallery_urls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function guessExtFromContentType(ct?: string | null) {
  const s = (ct ?? "").toLowerCase();
  if (s.includes("image/jpeg")) return "jpg";
  if (s.includes("image/png")) return "png";
  if (s.includes("image/webp")) return "webp";
  if (s.includes("image/gif")) return "gif";
  return "jpg";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  if (!roomId) {
    return NextResponse.json({ message: "Missing room id" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error }: {
    data: { gallery_urls: string | null } | null;
    error: any;
  } = await supabase
    .from("rooms")
    .select("gallery_urls")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    const msg = error?.message ?? "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const urls = splitGalleryUrls(data?.gallery_urls);
  if (!urls.length) {
    return NextResponse.json({ message: "No images" }, { status: 404 });
  }

  const zipStream = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => zipStream.destroy(err));
  archive.pipe(zipStream);

  // Phòng thường ~10 ảnh => fetch tuần tự là ổn
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) continue;

      const idx = String(i + 1).padStart(2, "0");
      const ext = guessExtFromContentType(res.headers.get("content-type"));
      if (!res.body) {
  throw new Error("Empty body");
}

const nodeStream = Readable.fromWeb(res.body as any);
archive.append(nodeStream as any, { name: `images/${idx}.${ext}` });

    } catch {
      continue;
    }
  }

  await archive.finalize();

  return new Response(zipStream as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="room-${roomId}-images.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
