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

    if (!file || !roomId) {
      return NextResponse.json({ error: "Missing file or room_id" }, { status: 400 })
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
    const isVideo = file.type.startsWith("video/")
    const folder = isVideo ? "video" : "images"

    const key = `rooms/${roomId}/${folder}/${crypto.randomUUID()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: "public, max-age=31536000, immutable",
      })
    )

    const url = `${R2_PUBLIC_BASE_URL}/${key}`

    return NextResponse.json({
      url,
      type: isVideo ? "video" : "image",
    })
  } catch (e: any) {
    console.error("R2 upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
