import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const runtime = "nodejs"

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ""
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ""
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ""
const R2_BUCKET = "rooms-media"

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

function missingEnv() {
  const miss: string[] = []
  if (!R2_ACCOUNT_ID) miss.push("R2_ACCOUNT_ID")
  if (!R2_ACCESS_KEY_ID) miss.push("R2_ACCESS_KEY_ID")
  if (!R2_SECRET_ACCESS_KEY) miss.push("R2_SECRET_ACCESS_KEY")
  if (!R2_PUBLIC_BASE_URL) miss.push("R2_PUBLIC_BASE_URL")
  return miss
}

export async function POST(req: Request) {
  try {
    const miss = missingEnv()
    if (miss.length) {
      return NextResponse.json(
        { error: `Missing R2 env: ${miss.join(", ")}` },
        { status: 500 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as any

    const roomId = String(body?.room_id || "").trim()
    const fixedName = String(body?.fixed_name || "").trim()
    const fileName = String(body?.file_name || "").trim()
    const contentType = String(body?.content_type || "").trim()
    const size = Number(body?.size || 0)

    if (!roomId || !fileName || !contentType || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json(
        { error: "Missing room_id/file_name/content_type/size" },
        { status: 400 }
      )
    }

    const isVideo = contentType.startsWith("video/")
    const isImage = contentType.startsWith("image/")
    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Chỉ hỗ trợ image/* hoặc video/*" }, { status: 400 })
    }

    // backend rule giống route cũ
    if (isVideo) {
      const MAX_VIDEO_MB = 20
      const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
      if (size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: `Video quá lớn. Giới hạn ${MAX_VIDEO_MB}MB` }, { status: 400 })
      }
      // ✅ allow any video/* (no mp4-only restriction)
    }

    // chỉ cho fixed thumb.webp đối với ảnh
    const allowFixedThumb = !isVideo && fixedName === "thumb.webp"
    if (allowFixedThumb && contentType !== "image/webp") {
      return NextResponse.json({ error: "thumb.webp phải là image/webp" }, { status: 400 })
    }

    const ext = fileName.split(".").pop()?.toLowerCase() || "bin"
    const folder = isVideo ? "video" : "images"

    const key = allowFixedThumb
      ? `rooms/${roomId}/${folder}/thumb.webp`
      : `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${ext}`

    const isThumb = key.endsWith("/thumb.webp")
    const cacheControl = isThumb
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable"

    const cmd = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
    })

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 })
    const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`

    return NextResponse.json({
      key,
      publicUrl,
      uploadUrl,
      requiredHeaders: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
      type: isVideo ? "video" : "image",
    })
  } catch (e: any) {
    console.error("R2 presign error:", e)
    return NextResponse.json(
      { error: `Presign failed: ${String(e?.message || e?.name || "unknown_error")}` },
      { status: 500 }
    )
  }
}
