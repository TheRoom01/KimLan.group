import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const R2_BUCKET = "rooms-media";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const accountId = String(process.env.R2_ACCOUNT_ID ?? "").trim();
    const accessKeyId = String(process.env.R2_ACCESS_KEY_ID ?? "").trim();
    const secretAccessKey = String(
      process.env.R2_SECRET_ACCESS_KEY ?? "",
    ).trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return apiError(
        "DATABASE_ERROR",
        "Kho ảnh CCCD chưa được cấu hình",
        500,
      );
    }

    const tenantId = parseUuid((await params).id, "tenant_id");
    const side = new URL(request.url).searchParams.get("side");

    if (side !== "front" && side !== "back") {
      return apiError(
        "INVALID_INPUT",
        "Mặt CCCD phải là front hoặc back",
        400,
      );
    }

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để xem ảnh CCCD",
        401,
      );
    }

    const { data: objectPath, error } = await supabase.rpc(
      "get_owner_tenant_identity_path_v1",
      {
        p_tenant_id: tenantId,
        p_side: side,
      },
    );

    if (error) return mapDatabaseError(error);
    if (!objectPath) {
      return apiError("NOT_FOUND", "Chưa có ảnh CCCD", 404);
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: String(objectPath),
      }),
      { expiresIn: 60 },
    );

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}
