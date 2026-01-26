import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

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

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File
    const roomId = String(form.get("room_id") || "").trim()
    const fixedName = String(form.get("fixed_name") || "").trim()
    
    if (!file || !roomId) {
      return NextResponse.json({ error: "Missing file or room_id" }, { status: 400 })
    }

    const isVideo = file.type.startsWith("video/")

    // ===== ENFORCE VIDEO RULE (BACKEND) =====
    if (isVideo) {
      const MAX_VIDEO_MB = 20
      const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024

      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: `Video quá lớn. Giới hạn ${MAX_VIDEO_MB}MB` },
          { status: 400 }
        )
      }

      const name = (file.name || "").toLowerCase()
      const isMp4 = file.type.includes("mp4") || name.endsWith(".mp4")
      if (!isMp4) {
        return NextResponse.json({ error: "Chỉ hỗ trợ video mp4" }, { status: 400 })
      }
    }
    // =======================================

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
    const folder = isVideo ? "video" : "images"

    // ✅ cho phép ép tên thumb.webp (chỉ cho ảnh)
    const allowFixedThumb = !isVideo && fixedName === "thumb.webp"
    if (allowFixedThumb && file.type !== "image/webp") {
      return NextResponse.json({ error: "thumb.webp phải là image/webp" }, { status: 400 })
    }

        const key = allowFixedThumb
      ? `rooms/${roomId}/${folder}/thumb.webp`
      : `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    // ✅ thumb.webp là file "cố định tên", không nên immutable 1 năm vì đổi cover sẽ bị cache rất lâu
    const isThumb = allowFixedThumb || key.endsWith("/thumb.webp")
    const cacheControl = isThumb
      ? "public, max-age=300, must-revalidate" // 5 phút + revalidate
      : "public, max-age=31536000, immutable" // ảnh/video thường: cache mạnh

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: cacheControl,
      })
    )

    const url = `${R2_PUBLIC_BASE_URL}/${key}`

    return NextResponse.json({
      key,
      url,
      type: isVideo ? "video" : "image",
    })

  } catch (e: any) {
    console.error("R2 upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
