import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { parseUuid } from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BUCKET = process.env.R2_BUCKET || "rooms-media";
const MAX_BYTES = 15 * 1024 * 1024;

function client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
}

async function authorize(contractId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: contract, error } = await supabase
    .from("rental_contracts")
    .select("id, room_id")
    .eq("id", contractId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !contract?.room_id) return null;
  const access = await authorizeRoomMutation(contract.room_id);
  return access.allowed ? contract : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = parseUuid((await params).id, "contract_id");
    if (!(await authorize(contractId))) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Bạn không có quyền xem ảnh hợp đồng" } }, { status: 403 });
    const s3 = client();
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `contracts/${contractId}/images/`, MaxKeys: 100 }));
    const items = await Promise.all((listed.Contents ?? []).filter((item) => item.Key).map(async (item) => ({
      key: item.Key!,
      size: item.Size ?? 0,
      updated_at: item.LastModified?.toISOString() ?? null,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: item.Key! }), { expiresIn: 60 * 60 }),
    })));
    items.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    console.error("Contract media list failed", error);
    return NextResponse.json({ ok: false, error: { code: "MEDIA_ERROR", message: "Không thể tải ảnh hợp đồng" } }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = parseUuid((await params).id, "contract_id");
    if (!(await authorize(contractId))) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Bạn không có quyền tải ảnh hợp đồng" } }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.file_name ?? "").trim();
    const contentType = String(body.content_type ?? "").trim();
    const size = Number(body.size ?? 0);
    if (!name || !contentType.startsWith("image/") || !Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Chỉ nhận file ảnh tối đa 15 MB" } }, { status: 400 });
    }
    const extension = name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const key = `contracts/${contractId}/images/${crypto.randomUUID()}.${extension}`;
    const cacheControl = "private, max-age=0, no-store";
    const uploadUrl = await getSignedUrl(client(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, CacheControl: cacheControl }), { expiresIn: 15 * 60 });
    return NextResponse.json({ ok: true, data: { key, uploadUrl, requiredHeaders: { "Content-Type": contentType, "Cache-Control": cacheControl } } });
  } catch (error) {
    console.error("Contract media presign failed", error);
    return NextResponse.json({ ok: false, error: { code: "MEDIA_ERROR", message: "Không thể chuẩn bị tải ảnh hợp đồng" } }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = parseUuid((await params).id, "contract_id");
    if (!(await authorize(contractId))) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Bạn không có quyền xóa ảnh hợp đồng" } }, { status: 403 });
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!key.startsWith(`contracts/${contractId}/images/`) || key.includes("..")) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Đường dẫn ảnh không hợp lệ" } }, { status: 400 });
    }
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return NextResponse.json({ ok: true, data: { deleted: key } });
  } catch (error) {
    console.error("Contract media delete failed", error);
    return NextResponse.json({ ok: false, error: { code: "MEDIA_ERROR", message: "Không thể xóa ảnh hợp đồng" } }, { status: 500 });
  }
}
