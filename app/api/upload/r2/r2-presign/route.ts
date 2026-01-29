import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export const runtime = "nodejs"

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET = "rooms-media"
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL!

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

function envOk() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE_URL)
}

export async function POST(req: Request) {
  try {
    if (!envOk()) {
      return NextResponse.json(
        { error: "Missing R2 env (ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/PUBLIC_BASE_URL)" },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({} as any))
    const roomId = String(body?.room_id || "").trim()
    const fixedName = String(body?.fixed_name || "").trim()
    const fileName = String(body?.file_name || "").trim()
    const contentType = String(body?.content_type || "").trim()
    const size = Number(body?.size || 0)

    if (!roomId || !fileName || !contentType || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Missing room_id/file_name/content_type/size" }, { status: 400 })
    }

    const isVideo = contentType.startsWith("video/")
    const isImage = contentType.startsWith("image/")

    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Chỉ hỗ trợ image/* hoặc video/*" }, { status: 400 })
    }

    // ===== ENFORCE VIDEO RULE (BACKEND, same as /upload/r2) =====
    if (isVideo) {
      const MAX_VIDEO_MB = 20
      const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
      if (size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: `Video quá lớn. Giới hạn ${MAX_VIDEO_MB}MB` }, { status: 400 })
      }

      const lower = fileName.toLowerCase()
      const isMp4 = contentType.includes("mp4") || lower.endsWith(".mp4")
      if (!isMp4) {
        return NextResponse.json({ error: "Chỉ hỗ trợ video mp4" }, { status: 400 })
      }
    }
    // =======================================

    const ext = fileName.split(".").pop()?.toLowerCase() || "bin"
    const folder = isVideo ? "video" : "images"

    // ✅ cho phép ép tên thumb.webp (chỉ cho ảnh)
    const allowFixedThumb = !isVideo && fixedName === "thumb.webp"
    if (allowFixedThumb && contentType !== "image/webp") {
      return NextResponse.json({ error: "thumb.webp phải là image/webp" }, { status: 400 })
    }

    const key = allowFixedThumb
      ? `rooms/${roomId}/${folder}/thumb.webp`
      : `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${ext}`

    const isThumb = allowFixedThumb || key.endsWith("/thumb.webp")
    const cacheControl = isThumb
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable"

    // Presign PUT
    const cmd = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
    })

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 }) // 60s
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
    return NextResponse.json({ error: "Presign failed" }, { status: 500 })
  }
}
