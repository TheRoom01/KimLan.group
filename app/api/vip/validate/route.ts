import { NextResponse } from "next/server";
import crypto from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIP_LINK_TABLE = "vip_access_links";

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function noStoreJson(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "").trim();

    if (!token || token.length < 20) {
      return noStoreJson(
        {
          valid: false,
          error: "VIP token không hợp lệ",
        },
        400
      );
    }

    const tokenHash = sha256(token);
    const supabase = createSupabaseAdminClient();

    /*
     * Route này là ranh giới xác thực VIP ở server.
     * Dùng service-role để việc kiểm tra token không phụ thuộc session anonymous,
     * RLS hoặc quyền EXECUTE của RPC validate_vip_access_link_v1.
     */
    const {
      data: link,
      error: linkError,
    } = await supabase
      .from(VIP_LINK_TABLE)
      .select(
        [
          "id",
          "expires_at",
          "revoked_at",
          "created_by",
        ].join(",")
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (linkError) {
      throw linkError;
    }

    if (
      !link ||
      link.revoked_at ||
      !link.expires_at
    ) {
      return noStoreJson({
        valid: false,
        error: "Link VIP không hợp lệ, đã hết hạn hoặc đã bị thu hồi",
      });
    }

    const expiresAtMs = new Date(link.expires_at).getTime();

    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= Date.now()
    ) {
      return noStoreJson({
        valid: false,
        error: "Link VIP đã hết hạn",
      });
    }

    let creatorAdminPhone: string | null = null;
    let creatorAdminName: string | null = null;

    const createdBy = String(link.created_by ?? "").trim();

    if (createdBy) {
      const {
        data: admin,
        error: adminError,
      } = await supabase
        .from("admin_users")
        .select("phone, full_name")
        .eq("user_id", createdBy)
        .maybeSingle();

      if (adminError) {
        console.warn(
          "[VIP VALIDATE ADMIN PROFILE]",
          adminError
        );
      } else if (admin) {
        creatorAdminPhone =
          String(admin.phone ?? "").trim() || null;

        creatorAdminName =
          String(admin.full_name ?? "").trim() || null;
      }
    }

    return noStoreJson({
      valid: true,
      expiresAt: link.expires_at,
      creatorAdminPhone,
      creatorAdminName,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);

    console.error("[VIP VALIDATE ERROR]", err);

    return noStoreJson(
      {
        valid: false,
        error: message,
      },
      500
    );
  }
}
