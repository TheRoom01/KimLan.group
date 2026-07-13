import { NextResponse } from "next/server";
import crypto from "crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIP_LINK_TABLE = "vip_access_links";
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const MAX_NOTE_LENGTH = 200;

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

function getSiteOrigin(
  request: Request
) {
  const configuredOrigin =
    String(
      process.env
        .NEXT_PUBLIC_SITE_URL ||
        ""
    )
      .trim()
      .replace(/\/+$/, "");

  return (
    configuredOrigin ||
    new URL(request.url).origin
  );
}

async function requireAdminL1() {
  const supabaseUser =
    await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return {
      response: noStoreJson(
        {
          ok: false,
          error: "Bạn chưa đăng nhập.",
        },
        401
      ),
    };
  }

  const {
    data: levelData,
    error: levelError,
  } = await supabaseUser.rpc(
    "get_my_admin_level"
  );

  const level = Number(
    levelData ?? 0
  );

  if (
    levelError ||
    level !== 1
  ) {
    return {
      response: noStoreJson(
        {
          ok: false,
          error:
            "Chỉ Admin L1 được quản lý link VIP.",
        },
        403
      ),
    };
  }

  return {
    user,
  };
}

export async function GET(
  request: Request
) {
  try {
    const guard =
      await requireAdminL1();

    if ("response" in guard) {
      return guard.response;
    }

    const supabase =
      createSupabaseAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from(VIP_LINK_TABLE)
      .select(
        [
          "id",
          "note",
          "expires_at",
          "revoked_at",
          "created_at",
          "created_by",
          "token_value",
        ].join(",")
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(100);

    if (error) {
      throw error;
    }

    const origin =
      getSiteOrigin(request);

    const rows =
      (data ?? []).map(
        (row: any) => {
          const {
            token_value,
            ...safeRow
          } = row;

          return {
            ...safeRow,
            link: token_value
              ? `${origin}/?vip=${encodeURIComponent(
                  token_value
                )}`
              : null,
          };
        }
      );

    return noStoreJson({
      ok: true,
      data: rows,
    });
  } catch (error: any) {
    console.error(
      "GET /api/admin/vip-links failed:",
      error
    );

    return noStoreJson(
      {
        ok: false,
        error:
          error?.message ||
          "Không tải được danh sách link VIP.",
      },
      500
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const guard =
      await requireAdminL1();

    if ("response" in guard) {
      return guard.response;
    }

    const body =
      await request
        .json()
        .catch(() => null);

    const requestedDays =
      Number(body?.days);

    const days =
      Number.isFinite(
        requestedDays
      )
        ? Math.trunc(
            requestedDays
          )
        : 20;

    if (
      days < MIN_DAYS ||
      days > MAX_DAYS
    ) {
      return noStoreJson(
        {
          ok: false,
          error:
            `Số ngày phải từ ${MIN_DAYS} đến ${MAX_DAYS}.`,
        },
        400
      );
    }

    const note =
      String(
        body?.note ?? ""
      )
        .trim()
        .slice(
          0,
          MAX_NOTE_LENGTH
        ) ||
      `VIP ${days} ngày`;

    /*
     * token_hash dùng để xác thực link.
     * token_value chỉ được đọc qua API Admin L1 để có thể copy lại link.
     */
    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    const tokenHash =
      sha256(token);

    const createdAt =
      new Date();

    const expiresAt =
      new Date(
        createdAt.getTime() +
          days *
            24 *
            60 *
            60 *
            1000
      );

    const supabase =
      createSupabaseAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from(VIP_LINK_TABLE)
      .insert({
        token_hash:
          tokenHash,

        token_value:
          token,

        note,

        expires_at:
          expiresAt.toISOString(),

        revoked_at:
          null,

        created_by:
          guard.user.id,
      })
      .select(
        [
          "id",
          "note",
          "expires_at",
          "revoked_at",
          "created_at",
          "created_by",
          "token_value",
        ].join(",")
      )
      .single();

    if (error) {
      throw error;
    }

    const origin =
      getSiteOrigin(request);

    const vipLink =
      `${origin}/?vip=${encodeURIComponent(
        token
      )}`;

    const {
      token_value:
        _tokenValue,
      ...safeData
    } = data as any;

    return noStoreJson({
      ok: true,
      data: {
        ...safeData,
        link: vipLink,
      },
      link: vipLink,
    });
  } catch (error: any) {
    console.error(
      "POST /api/admin/vip-links failed:",
      error
    );

    return noStoreJson(
      {
        ok: false,
        error:
          error?.message ||
          "Không tạo được link VIP.",
      },
      500
    );
  }
}

export async function DELETE(
  request: Request
) {
  try {
    const guard =
      await requireAdminL1();

    if ("response" in guard) {
      return guard.response;
    }

    const body =
      await request
        .json()
        .catch(() => null);

    const id =
      String(
        body?.id ?? ""
      ).trim();

    if (!id) {
      return noStoreJson(
        {
          ok: false,
          error:
            "Thiếu ID link VIP cần xóa.",
        },
        400
      );
    }

    const supabase =
      createSupabaseAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from(VIP_LINK_TABLE)
      .delete()
      .eq(
        "id",
        id
      )
      .select(
        "id"
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      return noStoreJson(
        {
          ok: false,
          error:
            "Link VIP không tồn tại hoặc đã bị xóa.",
        },
        404
      );
    }

    return noStoreJson({
      ok: true,
      deletedId:
        data.id,
    });
  } catch (error: any) {
    console.error(
      "DELETE /api/admin/vip-links failed:",
      error
    );

    return noStoreJson(
      {
        ok: false,
        error:
          error?.message ||
          "Không xóa được link VIP.",
      },
      500
    );
  }
}

