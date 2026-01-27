import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
  ""
).replace(/\/$/, "");

function safeRoomCode(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");
}

function keyFromPublicUrl(url: string) {
  // Ex: https://xxx.r2.dev/rooms/room-404/images/abc.webp  -> rooms/room-404/images/abc.webp
  if (!url) return null;
  const u = String(url).trim();
  if (!u.startsWith("http")) return null;

  // chỉ nhận url thuộc R2 public base (để tránh xoá nhầm link supabase storage)
  if (R2_PUBLIC_BASE_URL && !u.startsWith(R2_PUBLIC_BASE_URL)) return null;

  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/^\/+/, ""); // bỏ slash đầu
    return path || null;
  } catch {
    return null;
  }
}

function getS3() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const envFlags = {
  R2_ACCOUNT_ID: Boolean(R2_ACCOUNT_ID),
  R2_ACCESS_KEY_ID: Boolean(R2_ACCESS_KEY_ID),
  R2_SECRET_ACCESS_KEY: Boolean(R2_SECRET_ACCESS_KEY),
  R2_BUCKET: Boolean(R2_BUCKET),
};

if (!envFlags.R2_ACCOUNT_ID || !envFlags.R2_ACCESS_KEY_ID || !envFlags.R2_SECRET_ACCESS_KEY || !envFlags.R2_BUCKET) {
  return NextResponse.json(
    { error: "Missing R2 env", envFlags },
    { status: 500 }
  );
}

const s3 = getS3();


    const { id: roomId } = await params;
    const body = await req.json().catch(() => ({}));

    // yêu cầu client gửi room_code để build prefix
    const room_code = safeRoomCode(body?.room_code || "");
    const keep_urls: string[] = Array.isArray(body?.keep_urls) ? body.keep_urls : [];

    if (!room_code) {
      return NextResponse.json({ error: "Missing room_code" }, { status: 400 });
    }

    // prefix đúng theo convention bạn đang dùng trong RoomCard
    const prefix = `rooms/room-${room_code}/images/`;

    // build keepKeys từ keep_urls (chỉ giữ những url thuộc R2 public base)
    const keepKeys = new Set<string>();
    for (const url of keep_urls) {
      const k = keyFromPublicUrl(String(url));
      if (k) keepKeys.add(k);
    }

    // thumb.webp: để tránh stale, ta luôn xoá nó
    const thumbKey = `${prefix}thumb.webp`;

    // 1) list all objects trong prefix
    let continuationToken: string | undefined = undefined;
    const toDelete: string[] = [];

    do {
      // ✅ ÉP KIỂU “CỨNG” để TS không còn TS7022
      const resp = (await s3.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      )) as unknown as ListObjectsV2CommandOutput;

      const contents = resp.Contents ?? [];
      for (const obj of contents) {
        const key = obj.Key || "";
        if (!key) continue;

        // luôn xoá thumb để tránh stale
        if (key === thumbKey) {
          toDelete.push(key);
          continue;
        }

        // nếu không nằm trong keepKeys => xoá
        if (!keepKeys.has(key)) {
          toDelete.push(key);
        }
      }

      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);

    // 2) delete theo batch 1000 (giới hạn S3 API)
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      const delResp = await s3.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
      deleted += (delResp.Deleted || []).length;
    }

    return NextResponse.json({
      ok: true,
      roomId,
      room_code,
      prefix,
      keep_count: keepKeys.size,
      delete_count: toDelete.length,
      deleted,
      deleted_sample: toDelete.slice(0, 10), // ✅ giúp debug nhanh
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message ?? String(err),
        hint:
          "Nếu vẫn 500: mở Network -> prune-r2 -> Response để xem error cụ thể (thường là thiếu env hoặc AccessDenied).",
      },
      { status: 500 }
    );
  }
}
