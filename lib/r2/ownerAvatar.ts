import "server-only";

import {
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const OWNER_AVATAR_MAX_BYTES = 1024 * 1024;
export const OWNER_AVATAR_CONTENT_TYPE = "image/webp";

let cachedClient: S3Client | null = null;

function requiredEnvironmentValue(
  name: string,
  value: string | undefined,
) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`Missing R2 environment variable: ${name}`);
  }

  return normalized;
}

export function getOwnerAvatarR2Config() {
  const accountId = requiredEnvironmentValue(
    "R2_ACCOUNT_ID",
    process.env.R2_ACCOUNT_ID,
  );

  const accessKeyId = requiredEnvironmentValue(
    "R2_ACCESS_KEY_ID",
    process.env.R2_ACCESS_KEY_ID,
  );

  const secretAccessKey = requiredEnvironmentValue(
    "R2_SECRET_ACCESS_KEY",
    process.env.R2_SECRET_ACCESS_KEY,
  );

  const publicBaseUrl = requiredEnvironmentValue(
    "R2_PUBLIC_BASE_URL",
    process.env.R2_PUBLIC_BASE_URL,
  ).replace(/\/+$/, "");

  const bucket =
    String(process.env.R2_BUCKET ?? "").trim() ||
    "rooms-media";

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return {
    client: cachedClient,
    bucket,
    publicBaseUrl,
  };
}

export function createOwnerAvatarPath(userId: string) {
  return `owner-avatars/${userId}/${crypto.randomUUID()}.webp`;
}

export function isOwnedAvatarPath(
  userId: string,
  path: string,
) {
  const normalized = path.trim();

  return (
    normalized.startsWith(`owner-avatars/${userId}/`) &&
    normalized.endsWith(".webp") &&
    !normalized.includes("..")
  );
}

export function getOwnerAvatarPublicUrl(path: string) {
  const { publicBaseUrl } = getOwnerAvatarR2Config();

  return `${publicBaseUrl}/${path}`;
}

export async function deleteOwnerAvatarObject(
  path: string | null | undefined,
) {
  const normalized = String(path ?? "").trim();

  if (!normalized) return;

  const { client, bucket } = getOwnerAvatarR2Config();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalized,
    }),
  );
}