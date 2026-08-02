import { NextRequest, NextResponse } from "next/server";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "rooms-media";

function safeRoomCode(input: unknown) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "");
}

function keyFromPublicUrl(value: unknown) {
  const url = String(value || "").trim();

  if (url.startsWith("rooms/")) return url;
  if (url.startsWith("/rooms/")) return url.replace(/^\/+/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return null;
  }

  try {
    const key = new URL(url).pathname.replace(/^\/+/, "");
    return key.startsWith("rooms/") ? key : null;
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET
    ) {
      return NextResponse.json(
        { error: "Missing R2 env" },
        { status: 500 },
      );
    }

    const { id: roomId } = await params;
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const roomCode = safeRoomCode(body?.room_code);
    const keepUrls = Array.isArray(body?.keep_urls)
      ? body.keep_urls.map(String).map((item) => item.trim()).filter(Boolean)
      : [];

    if (keepUrls.length === 0) {
      return NextResponse.json(
        { error: "keep_urls is empty; refuse to prune for safety" },
        { status: 400 },
      );
    }

    const uuidPrefix = `rooms/${roomId}/images/`;
    const legacyPrefix = roomCode
      ? `rooms/room-${roomCode}/images/`
      : "";
    const validPrefixes = [uuidPrefix, legacyPrefix].filter(Boolean);
    const keepKeys = new Set<string>();

    for (const value of keepUrls) {
      const key = keyFromPublicUrl(value);
      if (key && validPrefixes.some((prefix) => key.startsWith(prefix))) {
        keepKeys.add(key);
      }
    }

    keepKeys.add(`${uuidPrefix}thumb.webp`);
    if (legacyPrefix) keepKeys.add(`${legacyPrefix}thumb.webp`);

    function realKeepCount(prefix: string) {
      return [...keepKeys].filter(
        (key) => key.startsWith(prefix) && !key.endsWith("/thumb.webp"),
      ).length;
    }

    if (validPrefixes.every((prefix) => realKeepCount(prefix) === 0)) {
      return NextResponse.json(
        { error: "No valid keep keys; refuse to prune for safety" },
        { status: 400 },
      );
    }

    const s3 = getS3();
    const { data: sharedMedia, error: sharedMediaError } = await authorization.supabase
      .from("room_media")
      .select("path, url")
      .neq("room_id", roomId);
    if (sharedMediaError) {
      return NextResponse.json({ error: "Cannot verify shared media references" }, { status: 500 });
    }
    const sharedKeys = new Set(
      (sharedMedia ?? [])
        .flatMap((item) => [keyFromPublicUrl(item.path), keyFromPublicUrl(item.url)])
        .filter((key): key is string => Boolean(key)),
    );

    async function prunePrefix(prefix: string) {
      if (realKeepCount(prefix) === 0) {
        return { prefix, skipped: true, deleted: 0 };
      }

      let continuationToken: string | undefined;
      const keysToDelete: string[] = [];

      do {
        const response = await s3.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        for (const object of response.Contents ?? []) {
          const key = object.Key || "";
          if (key && !keepKeys.has(key) && !sharedKeys.has(key)) keysToDelete.push(key);
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);

      let deleted = 0;

      for (let index = 0; index < keysToDelete.length; index += 1000) {
        const chunk = keysToDelete.slice(index, index + 1000);
        const result = await s3.send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        deleted += result.Deleted?.length ?? 0;
      }

      return {
        prefix,
        skipped: false,
        toDelete: keysToDelete.length,
        deleted,
      };
    }

    const results = [await prunePrefix(uuidPrefix)];
    if (legacyPrefix) results.push(await prunePrefix(legacyPrefix));

    return NextResponse.json({
      ok: true,
      roomId,
      room_code: roomCode,
      results,
    });
  } catch (error) {
    console.error("R2 prune error:", error);

    return NextResponse.json(
      { error: "Prune failed" },
      { status: 500 },
    );
  }
}
