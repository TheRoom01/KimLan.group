import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET!;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;

const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const r2 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function listAllKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined = undefined;

  do {
    const output: any = await r2.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    const contents = Array.isArray(output?.Contents) ? output.Contents : [];
    for (const obj of contents) {
      const key = typeof obj?.Key === "string" ? obj.Key : "";
      if (key) keys.push(key);
    }

    token = output?.IsTruncated ? output?.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function deleteKeys(keys: string[]): Promise<number> {
  if (!keys.length) return 0;

  let deletedCount = 0;

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);

    const output: any = await r2.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );

    deletedCount += Array.isArray(output?.Deleted) ? output.Deleted.length : 0;
  }

  return deletedCount;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!BUCKET || !ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing R2 env vars",
        hasBucket: !!BUCKET,
        hasAccountId: !!ACCOUNT_ID,
        hasAccessKey: !!ACCESS_KEY_ID,
        hasSecret: !!SECRET_ACCESS_KEY,
      },
      { status: 500 }
    );
  }

  try {
    const { id } = await params;
    const roomId = String(id || "").trim();

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "Missing room id" },
        { status: 400 }
      );
    }

    // phần code bên dưới giữ tiếp ở đây...

    let roomCode = "";
    try {
      const body = await req.json();
      roomCode = String(body?.room_code || "").trim();
    } catch {
      roomCode = "";
    }

    const prefixes: string[] = [`rooms/${roomId}/`];

    if (roomCode) {
      prefixes.push(`rooms/${roomCode}/`);
    }

    const allKeys = new Set<string>();

    for (const prefix of prefixes) {
      const keys = await listAllKeys(prefix);
      for (const key of keys) {
        allKeys.add(key);
      }
    }

    const deleted = await deleteKeys(Array.from(allKeys));

    return NextResponse.json({
      ok: true,
      room_id: roomId,
      room_code: roomCode || null,
      deleted,
    });
  } catch (error: any) {
    console.error("delete-r2-all failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "delete-r2-all failed",
      },
      { status: 500 }
    );
  }
}