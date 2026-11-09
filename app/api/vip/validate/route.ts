import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VIP_ACCESS_COOKIE } from "@/lib/rooms/anonymousHomeAccess";

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function clearVipCookie(response: NextResponse) {
  response.cookies.set(VIP_ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token ?? "").trim();
    const cookieStore = await cookies();

    if (token && (token.length < 20 || token.length > 512)) {
      return clearVipCookie(NextResponse.json(
        {
          valid: false,
          error: "VIP token không hợp lệ",
        },
        { status: 400 }
      ));
    }

    const tokenHash = token
      ? sha256(token)
      : String(cookieStore.get(VIP_ACCESS_COOKIE)?.value ?? "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
      return clearVipCookie(NextResponse.json(
        { valid: false, error: "Không có phiên Link Giỏ hàng hợp lệ" },
        { status: 400 },
      ));
    }
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc(
      "validate_vip_access_link_v1",
      {
        p_token_hash: tokenHash,
      }
    );

    if (error) {
      console.error("[VIP VALIDATE RPC]", error);

      return NextResponse.json(
        {
          valid: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.valid || !row?.expires_at) {
      const invalidResponse = NextResponse.json(
        {
          valid: false,
          error: "Link Giỏ hàng không hợp lệ, đã hết hạn hoặc đã bị thu hồi",
        },
        { status: 200 }
      );
      return clearVipCookie(invalidResponse);
    }

    const expiresAtMs = new Date(row.expires_at).getTime();

    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= Date.now()
    ) {
      const expiredResponse = NextResponse.json(
        {
          valid: false,
          error: "Link Giỏ đã hết hạn",
        },
        { status: 200 }
      );
      return clearVipCookie(expiredResponse);
    }

    const response = NextResponse.json(
    {
      valid: true,

      expiresAt: row.expires_at,

      creatorAdminPhone:
        String(row.creator_admin_phone ?? "").trim() || null,

      creatorAdminName:
        String(row.creator_admin_name ?? "").trim() || null,

      // ✅ trả hash token để client gửi xuống RPC
      tokenHash,
    });


response.cookies.set(
  VIP_ACCESS_COOKIE,
  tokenHash,
  {
    httpOnly:true,
    secure:
      process.env.NODE_ENV === "production",

    sameSite:"lax",

    expires:
      new Date(row.expires_at),

    path:"/",
  }
);


return response;

  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);

    console.error("[VIP VALIDATE ERROR]", err);

    return NextResponse.json(
      {
        valid: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
