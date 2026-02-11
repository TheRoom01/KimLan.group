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

    // Safety: nếu keep_urls rỗng thì KHÔNG prune (tránh xoá nhầm do client bug)
    if (keep_urls.length === 0) {
      return NextResponse.json(
        { error: "keep_urls is empty; refuse to prune for safety" },
        { status: 400 }
      );
    }

   // =======================
  // ✅ NEW: hỗ trợ BOTH prefix
  // - NEW (UUID):   rooms/<roomId>/images/
  // - LEGACY:       rooms/room-<room_code>/images/
  // =======================
  const prefixUuid = `rooms/${roomId}/images/`;
  const prefixLegacy = room_code ? `rooms/room-${room_code}/images/` : "";

  // helper: đếm keepKeys thuộc prefix
  function countRealKeysUnder(prefix: string, keys: Set<string>) {
  let c = 0;
  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    if (k.endsWith("/thumb.webp")) continue; // ✅ không tính thumb
    c++;
  }
  return c;
}

// =======================
// ✅ NEW: keepKeys cho cả UUID prefix và legacy prefix
// =======================
const keepKeys = new Set<string>();
for (const url of keep_urls) {
  const k = keyFromPublicUrl(String(url));
  if (!k) continue;
  if (k.startsWith(prefixUuid) || (prefixLegacy && k.startsWith(prefixLegacy))) keepKeys.add(k);
}

// luôn giữ thumb cho cả 2 prefix (nếu tồn tại)
keepKeys.add(`${prefixUuid}thumb.webp`);
if (prefixLegacy) keepKeys.add(`${prefixLegacy}thumb.webp`);

// Safety: nếu keep_urls không map được key nào hợp lệ => KHÔNG prune
const keepUnderUuid = countRealKeysUnder(prefixUuid, keepKeys);
const keepUnderLegacy = prefixLegacy ? countRealKeysUnder(prefixLegacy, keepKeys) : 0;

// nếu chỉ có thumb (<=1 key) dưới cả 2 prefix => refuse
if (keepUnderUuid <= 0 && keepUnderLegacy <= 0) {
  return NextResponse.json(
    {
      error: "No valid keepKeys under uuid/legacy prefixes; refuse to prune for safety",
      room_code,
      prefixUuid,
      prefixLegacy,
      keep_urls_count: keep_urls.length,
    },
    { status: 400 }
  );
}

  async function prunePrefix(prefix: string) {
  // chỉ prune prefix này nếu có ít nhất 1 key thật (không tính thumb)
 const keepCount = countRealKeysUnder(prefix, keepKeys);
  if (keepCount <= 0) {
    return {
      prefix,
      skipped: true,
      reason: "no keep keys under this prefix (safety)",
      toDelete: 0,
      deleted: 0,
    };
  }

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
      if (!keepKeys.has(key)) toDelete.push(key);
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

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

  return {
    prefix,
    skipped: false,
    toDelete: toDelete.length,
    deleted,
    deleted_sample: toDelete.slice(0, 10),
  };
}

const r1 = await prunePrefix(prefixUuid);
const r2 = prefixLegacy ? await prunePrefix(prefixLegacy) : { prefix: "", skipped: true, reason: "no room_code", toDelete: 0, deleted: 0 };

   return NextResponse.json({
  ok: true,
  roomId,
  room_code,
  prefixUuid,
  prefixLegacy,
  keep_count_total: keepKeys.size,
  keep_urls_count: keep_urls.length,
  results: [r1, r2],
  kept_sample: Array.from(keepKeys).slice(0, 10),
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
