import { NextRequest, NextResponse } from "next/server";
import type { ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import type { DeleteObjectsCommandOutput } from "@aws-sdk/client-s3";


import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET!;
const ENDPOINT = process.env.R2_ENDPOINT!;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;

const r2 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function listAllKeys(prefix: string) {
  const keys: string[] = [];
  let token: string | undefined = undefined;

  do {
  const res: ListObjectsV2CommandOutput = await r2.send(
  new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    ContinuationToken: token,
  })
);

    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function deleteKeys(keys: string[]) {
  if (!keys.length) return 0;

  let deleted = 0;

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);

const res: DeleteObjectsCommandOutput = await r2.send(
  new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: {
      Objects: chunk.map((Key) => ({ Key })),
      Quiet: false,
    },
  })
);

    deleted += res.Deleted?.length ?? 0;
  }

  return deleted;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const roomId = String(id || "").trim();

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "Missing room id" },
        { status: 400 }
      );
    }

    let roomCode = "";
    try {
      const body = await req.json();
      roomCode = String(body?.room_code || "").trim();
    } catch {
      roomCode = "";
    }

    const prefixes = [`rooms/${roomId}/`];

    // legacy cũ nếu trước đây từng lưu theo mã phòng
    if (roomCode) {
      prefixes.push(`rooms/${roomCode}/`);
    }

    const allKeys = new Set<string>();

    for (const prefix of prefixes) {
      const keys = await listAllKeys(prefix);
      for (const key of keys) allKeys.add(key);
    }

    const deleted = await deleteKeys([...allKeys]);

    return NextResponse.json({
      ok: true,
      room_id: roomId,
      room_code: roomCode || null,
      deleted,
    });
  } catch (e: any) {
    console.error("delete-r2-all failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "delete-r2-all failed" },
      { status: 500 }
    );
  }
}