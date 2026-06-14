import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "").trim();

    if (!token || token.length < 20) {
      return NextResponse.json(
        {
          valid: false,
          error: "VIP token không hợp lệ",
        },
        { status: 400 }
      );
    }

    const tokenHash = sha256(token);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc(
      "validate_vip_access_link_v1",
      {
        p_token_hash: tokenHash,
      }
    );

    if (error) {
      return NextResponse.json(
        {
          valid: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const row = data?.[0];

    if (!row?.valid || !row?.expires_at) {
      return NextResponse.json({
        valid: false,
      });
    }

    return NextResponse.json({
      valid: true,
      expiresAt: row.expires_at,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        valid: false,
        error: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}