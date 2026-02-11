import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";

// sanitize room_code
function safeRoomCode(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");
}

function keyFromPublicUrl(url: string) {
  // Chấp nhận mọi https URL (pub.r2.dev hoặc custom domain),
  // miễn pathname trỏ vào key trong bucket (rooms/...)
  if (!url) return null;
  const u = String(url).trim();

  // 1) relative key: "rooms/..." hoặc "/rooms/..."
  if (u.startsWith("rooms/")) return u;
  if (u.startsWith("/rooms/")) return u.replace(/^\/+/, "");

  // 2) absolute URL
  if (!(u.startsWith("http://") || u.startsWith("https://"))) return null;

  try {
    const parsed = new URL(u);
    const key = parsed.pathname.replace(/^\/+/, "");
    // Chỉ nhận key trong bucket, tránh nhầm supabase/ngoài
    if (!key.startsWith("rooms/")) return null;
    return key || null;
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

    if (
      !envFlags.R2_ACCOUNT_ID ||
      !envFlags.R2_ACCESS_KEY_ID ||
      !envFlags.R2_SECRET_ACCESS_KEY ||
      !envFlags.R2_BUCKET
    ) {
      return NextResponse.json({ error: "Missing R2 env", envFlags }, { status: 500 });
    }

    const s3 = getS3();

    const { id: roomId } = await params;
    const body = await req.json().catch(() => ({} as any));

    // yêu cầu client gửi room_code để build prefix
   const room_code = safeRoomCode(body?.room_code || "");
   const keep_urls: string[] = Array.isArray(body?.keep_urls)
    ? body.keep_urls.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

    if (!room_code) {
      return NextResponse.json({ error: "Missing room_code" }, { status: 400 });
    }

    // Safety: nếu keep_urls rỗng thì KHÔNG prune (tránh xoá nhầm do client bug)
    if (keep_urls.length === 0) {
      return NextResponse.json(
        { error: "keep_urls is empty; refuse to prune for safety" },
        { status: 400 }
      );
    }

    // prefix đúng theo convention bạn đang dùng trong RoomCard
    const prefix = `rooms/room-${room_code}/images/`;

    // build keepKeys từ keep_urls (chỉ giữ những url/keys thuộc đúng prefix của room_code hiện tại)
    const keepKeys = new Set<string>();
    for (const url of keep_urls) {
      const k = keyFromPublicUrl(String(url));
      if (k && k.startsWith(prefix)) keepKeys.add(k);
    }

    // Giữ thumb.webp để không gãy cover sau khi edit
    const thumbKey = `${prefix}thumb.webp`;
    keepKeys.add(thumbKey);

    // Safety: nếu không giữ được bất kỳ ảnh nào thuộc prefix => KHÔNG prune
// (tránh trường hợp client gửi URL sai domain/path)
if (keepKeys.size <= 1) {
  return NextResponse.json(
    {
      error: "No valid keepKeys under prefix; refuse to prune for safety",
      room_code,
      prefix,
      keep_urls_count: keep_urls.length,
    },
    { status: 400 }
  );
}


    // 1) list all objects trong prefix
    let continuationToken: string | undefined = undefined;
    const toDelete: string[] = [];

    do {
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
    kept_sample: Array.from(keepKeys).slice(0, 10),
    deleted_sample: toDelete.slice(0, 10), // giúp debug nhanh
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
