import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const R2_BUCKET = process.env.R2_BUCKET || "rooms-media";
export const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export function assertR2Env() {
  const missing: string[] = [];

  if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_BUCKET) missing.push("R2_BUCKET");
  if (!R2_PUBLIC_BASE_URL) missing.push("R2_PUBLIC_BASE_URL");

  if (missing.length) {
    throw new Error(`Missing R2 env: ${missing.join(", ")}`);
  }
}

export function publicR2Url(key: string) {
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

export function makeZaloTempImageKey(batchId: string, imageId: string, ext = "webp") {
  return `zalo-temp/${batchId}/source/${imageId}.${ext.replace(/^\./, "")}`;
}

export function makeRoomImageKey(roomId: string, imageId: string, ext = "webp") {
  return `rooms/${roomId}/images/${imageId}.${ext.replace(/^\./, "")}`;
}

export async function uploadBufferToR2(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
  cacheControl?: string;
}) {
  assertR2Env();

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
      CacheControl: params.cacheControl ?? "public, max-age=300, must-revalidate",
    })
  );

  return {
    key: params.key,
    url: publicR2Url(params.key),
  };
}

export async function copyR2Object(params: {
  fromKey: string;
  toKey: string;
  contentType?: string;
  cacheControl?: string;
}) {
  assertR2Env();

  await r2Client.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      CopySource: `${R2_BUCKET}/${encodeURI(params.fromKey)}`,
      Key: params.toKey,
      ContentType: params.contentType,
      CacheControl: params.cacheControl ?? "public, max-age=31536000, immutable",
      MetadataDirective: params.contentType ? "REPLACE" : "COPY",
    })
  );

  return {
    key: params.toKey,
    url: publicR2Url(params.toKey),
  };
}

export async function deleteR2Object(key: string) {
  assertR2Env();

  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    })
  );
}

export async function deleteR2Keys(keys: string[]) {
  assertR2Env();

  const cleanKeys = Array.from(new Set(keys.map((x) => x.trim()).filter(Boolean)));
  if (!cleanKeys.length) return 0;

  let deleted = 0;

  for (let i = 0; i < cleanKeys.length; i += 1000) {
    const chunk = cleanKeys.slice(i, i + 1000);

    const out: any = await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: false,
        },
      })
    );

    deleted += Array.isArray(out?.Deleted) ? out.Deleted.length : chunk.length;
  }

  return deleted;
}

export async function listR2KeysByPrefix(prefix: string) {
  assertR2Env();

  const keys: string[] = [];
  let token: string | undefined;

  do {
    const out: any = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    for (const obj of out?.Contents ?? []) {
      if (obj?.Key) keys.push(String(obj.Key));
    }

    token = out?.IsTruncated ? out?.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

export async function deleteR2Prefix(prefix: string) {
  const keys = await listR2KeysByPrefix(prefix);
  return deleteR2Keys(keys);
}