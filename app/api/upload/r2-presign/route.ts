import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || "";
const R2_BUCKET = "rooms-media";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function missingEnv() {
  const missing: string[] = [];
  if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_PUBLIC_BASE_URL) missing.push("R2_PUBLIC_BASE_URL");
  return missing;
}

export async function POST(request: Request) {
  try {
    const missing = missingEnv();

    if (missing.length) {
      return NextResponse.json(
        { error: `Missing R2 env: ${missing.join(", ")}` },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    const roomId = String(body?.room_id || "").trim();
    const propertyId = String(body?.property_id || "").trim();
    const tenantId = String(body?.tenant_id || "").trim();
    const tenantSide = String(body?.tenant_side || "").trim();
    const fixedName = String(body?.fixed_name || "").trim();
    const fileName = String(body?.file_name || "").trim();
    const contentType = String(body?.content_type || "").trim();
    const size = Number(body?.size || 0);

    if (
      (!roomId && !propertyId) ||
      !fileName ||
      !contentType ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return NextResponse.json(
        { error: "Missing room_id or property_id/file_name/content_type/size" },
        { status: 400 },
      );
    }

    const authorization = roomId ? await authorizeRoomMutation(roomId) : null;
    if (authorization && !authorization.allowed) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    if (propertyId) {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      const { data: canManage } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
      if (canManage !== true) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const isVideo = contentType.startsWith("video/");
    const isImage = contentType.startsWith("image/");

    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: "Chỉ hỗ trợ image/* hoặc video/*" },
        { status: 400 },
      );
    }

    if (tenantId) {
      if (!authorization || !authorization.allowed) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      if (!isImage || (tenantSide !== "front" && tenantSide !== "back")) {
        return NextResponse.json(
          { error: "Ảnh CCCD phải là image/* và có mặt front hoặc back" },
          { status: 400 },
        );
      }

      const { data: relation, error: relationError } =
        await authorization.supabase.rpc(
          "owner_tenant_belongs_to_room_v1",
          {
            p_room_id: roomId,
            p_tenant_id: tenantId,
          },
        );

      if (relationError) {
        return NextResponse.json(
          { error: "Không thể xác minh khách thuê" },
          { status: 500 },
        );
      }

      if (relation !== true) {
        return NextResponse.json(
          { error: "Khách thuê không thuộc phòng này" },
          { status: 403 },
        );
      }
    }

    if (isVideo) {
      const maxVideoBytes = 50 * 1024 * 1024;

      if (size > maxVideoBytes) {
        return NextResponse.json(
          { error: "Video quá lớn. Giới hạn 50MB" },
          { status: 400 },
        );
      }
    }

    const allowFixedThumb = !isVideo && fixedName === "thumb.webp";

    if (allowFixedThumb && contentType !== "image/webp") {
      return NextResponse.json(
        { error: "thumb.webp phải là image/webp" },
        { status: 400 },
      );
    }

    const extension = fileName.split(".").pop()?.toLowerCase() || "bin";
    const folder = isVideo ? "video" : "images";
    const key = propertyId
      ? `properties/${propertyId}/images/${crypto.randomUUID()}.${extension}`
      : tenantId
      ? `rooms/${roomId}/tenants/${tenantId}/cccd-${tenantSide}-${crypto.randomUUID()}.${extension}`
      : allowFixedThumb
      ? `rooms/${roomId}/${folder}/thumb.webp`
      : `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${extension}`;

    const isThumb = key.endsWith("/thumb.webp");
    const cacheControl = isThumb
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable";

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: 15 * 60,
    });

    return NextResponse.json({
      key,
      publicUrl: `${R2_PUBLIC_BASE_URL}/${key}`,
      uploadUrl,
      requiredHeaders: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
      type: isVideo ? "video" : "image",
    });
  } catch (error) {
    console.error("R2 presign error:", error);

    return NextResponse.json(
      { error: "Presign failed" },
      { status: 500 },
    );
  }
}
