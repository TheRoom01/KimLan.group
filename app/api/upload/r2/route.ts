import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = "rooms-media";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(request: Request) {
  try {
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_PUBLIC_BASE_URL
    ) {
      return NextResponse.json(
        { error: "Upload failed: missing R2 env" },
        { status: 500 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const roomId = String(form.get("room_id") || "").trim();
    const fixedName = String(form.get("fixed_name") || "").trim();

    if (!(file instanceof File) || !roomId) {
      return NextResponse.json(
        { error: "Missing file or room_id" },
        { status: 400 },
      );
    }

    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: "Chỉ hỗ trợ image/* hoặc video/*" },
        { status: 400 },
      );
    }

    if (isVideo && file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Video quá lớn. Giới hạn 50MB" },
        { status: 400 },
      );
    }

    const allowFixedThumb = isImage && fixedName === "thumb.webp";

    if (allowFixedThumb && file.type !== "image/webp") {
      return NextResponse.json(
        { error: "thumb.webp phải là image/webp" },
        { status: 400 },
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const folder = isVideo ? "video" : "images";
    const key = allowFixedThumb
      ? `rooms/${roomId}/${folder}/thumb.webp`
      : `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${extension}`;

    const isThumb = key.endsWith("/thumb.webp");
    const cacheControl = isThumb
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable";

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        CacheControl: cacheControl,
      }),
    );

    return NextResponse.json({
      key,
      url: `${R2_PUBLIC_BASE_URL}/${key}`,
      type: isVideo ? "video" : "image",
    });
  } catch (error) {
    console.error("R2 upload error:", error);

    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
