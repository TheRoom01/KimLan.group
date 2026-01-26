import { NextResponse } from "next/server";
import archiver from "archiver";
import crypto from "crypto";
import { Readable } from "stream";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// ✅ thêm các module để ghi file tạm
import fs from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";

// ====== R2 config ======
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";
const R2_BUCKET = process.env.R2_BUCKET || "rooms-media";

function envError() {
  const miss: string[] = [];
  if (!R2_ACCOUNT_ID) miss.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) miss.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) miss.push("R2_SECRET_ACCESS_KEY");
  if (!R2_PUBLIC_BASE_URL) miss.push("R2_PUBLIC_BASE_URL");
  return miss.length ? `Thiếu env: ${miss.join(", ")}` : null;
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function sha1(text: string) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function guessExtFromContentType(ct?: string | null) {
  const s = (ct ?? "").toLowerCase();
  if (s.includes("image/jpeg")) return "jpg";
  if (s.includes("image/png")) return "png";
  if (s.includes("image/webp")) return "webp";
  if (s.includes("image/gif")) return "gif";
  return "jpg";
}

async function existsOnR2(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// chạy song song có giới hạn
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    if (!roomId) {
      return NextResponse.json({ message: "Thiếu ID phòng" }, { status: 400 });
    }

    const e = envError();
    if (e) return NextResponse.json({ message: e }, { status: 500 });

    const supabase = createSupabaseAdminClient();

    // ✅ Lấy ảnh từ bảng room_media
    const { data: images, error } = await supabase
      .from("room_media")
      .select("url, sort_order")
      .eq("room_id", roomId)
      .eq("type", "image")
      .order("sort_order", { ascending: true });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    const urls = (Array.isArray(images) ? images : [])
      .map((x: any) => String(x?.url || "").trim())
      .filter(Boolean);

    if (!urls.length) {
      return NextResponse.json({ message: "Phòng này chưa có ảnh" }, { status: 404 });
    }

    // ✅ Version theo danh sách URL + thứ tự
    const version = sha1(urls.join("\n"));
    const zipKey = `room-zips/${roomId}/v-${version}.zip`;
    const zipUrl = `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${zipKey}`;

    // ✅ Có sẵn zip thì tải ngay
    if (await existsOnR2(zipKey)) {
      return NextResponse.redirect(zipUrl);
    }

    // ====== TẠO ZIP RA FILE TẠM (để có ContentLength) ======
    const tmpPath = path.join(os.tmpdir(), `room-${roomId}-${version}.zip`);
    const output = fs.createWriteStream(tmpPath);

    const archive = archiver("zip", { zlib: { level: 3 } }); // level thấp cho nhanh
    archive.on("error", (err) => output.destroy(err));
    archive.pipe(output);

    const CONCURRENCY = 6;
    const TIMEOUT_MS = 15000;

    await mapLimit(urls, CONCURRENCY, async (url, i) => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);

        if (!res.ok || !res.body) return null;

        const idx = String(i + 1).padStart(2, "0");
        const ext = guessExtFromContentType(res.headers.get("content-type"));
        const nodeStream = Readable.fromWeb(res.body as any);

        archive.append(nodeStream as any, { name: `images/${idx}.${ext}` });
        return true;
      } catch {
        return null;
      }
    });

    await archive.finalize();

    // đợi file zip ghi xong
    await new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", (err) => reject(err));
    });

    // ====== UPLOAD LÊN R2 VỚI ContentLength (FIX LỖI 500) ======
    const stat = fs.statSync(tmpPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: zipKey,
        Body: fs.createReadStream(tmpPath),
        ContentType: "application/zip",
        ContentLength: stat.size, // ✅ quan trọng: có độ dài thì không còn header undefined
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    // dọn file tạm
    try {
      fs.unlinkSync(tmpPath);
    } catch {}

    // xong thì chuyển qua link zip trên R2
    return NextResponse.redirect(zipUrl);
  } catch (err: any) {
    // trả lỗi rõ ràng thay vì 500 trắng
    return NextResponse.json(
      { message: err?.message || "download-images failed" },
      { status: 500 }
    );
  }
}
