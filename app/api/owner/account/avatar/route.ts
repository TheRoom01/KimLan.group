import {
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_BASE_URL =
  process.env.R2_PUBLIC_BASE_URL || "";
const R2_BUCKET =
  process.env.R2_BUCKET || "rooms-media";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

type AccountPanelResponse = {
  current_user?: {
    avatar_url?: unknown;
  };
};

function missingR2Env() {
  const missing: string[] = [];

  if (!R2_ACCOUNT_ID) {
    missing.push("R2_ACCOUNT_ID");
  }

  if (!R2_ACCESS_KEY_ID) {
    missing.push("R2_ACCESS_KEY_ID");
  }

  if (!R2_SECRET_ACCESS_KEY) {
    missing.push("R2_SECRET_ACCESS_KEY");
  }

  if (!R2_PUBLIC_BASE_URL) {
    missing.push("R2_PUBLIC_BASE_URL");
  }

  if (!R2_BUCKET) {
    missing.push("R2_BUCKET");
  }

  return missing;
}

/**
 * Chỉ trả về object key nếu URL:
 *
 * 1. Thuộc R2 public base hiện tại.
 * 2. Nằm trong thư mục avatar của chính user.
 * 3. Là file WebP.
 *
 * Không xóa URL avatar bên ngoài như Google/Facebook.
 */
function avatarKeyFromPublicUrl(
  value: unknown,
  userId: string,
) {
  const rawUrl = String(value ?? "").trim();

  if (!rawUrl || !R2_PUBLIC_BASE_URL) {
    return null;
  }

  try {
    const baseUrl = new URL(R2_PUBLIC_BASE_URL);
    const avatarUrl = new URL(rawUrl);

    if (baseUrl.origin !== avatarUrl.origin) {
      return null;
    }

    const normalizedBasePath =
      baseUrl.pathname.replace(/\/+$/, "");

    const normalizedAvatarPath =
      avatarUrl.pathname.replace(/^\/+/, "");

    const basePathWithoutSlash =
      normalizedBasePath.replace(/^\/+/, "");

    let key = normalizedAvatarPath;

    if (basePathWithoutSlash) {
      const prefix = `${basePathWithoutSlash}/`;

      if (!key.startsWith(prefix)) {
        return null;
      }

      key = key.slice(prefix.length);
    }

    try {
      key = decodeURIComponent(key);
    } catch {
      return null;
    }

    const expectedPrefix = `owner-avatars/${userId}/`;

    if (!key.startsWith(expectedPrefix)) {
      return null;
    }

    if (!key.toLowerCase().endsWith(".webp")) {
      return null;
    }

    return key;
  } catch {
    return null;
  }
}

async function getCurrentAvatarUrl(
  supabase: Awaited<
    ReturnType<typeof createSupabaseServerClient>
  >,
) {
  const { data, error } = await supabase.rpc(
    "get_owner_account_panel_v1",
  );

  if (error) {
    throw error;
  }

  const panel = data as AccountPanelResponse | null;

  const avatarUrl =
    panel?.current_user?.avatar_url;

  return typeof avatarUrl === "string"
    ? avatarUrl.trim()
    : null;
}

async function deleteR2Object(key: string | null) {
  if (!key) {
    return {
      deleted: false,
      reason: "no_managed_key",
    };
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    );

    return {
      deleted: true,
      key,
    };
  } catch (error) {
    /**
     * Không rollback avatar mới chỉ vì cleanup ảnh cũ thất bại.
     * File thừa có thể được dọn bằng job định kỳ sau này.
     */
    console.error(
      "[Owner Avatar] Delete old R2 object failed:",
      error,
    );

    return {
      deleted: false,
      key,
      reason: "delete_failed",
    };
  }
}

export async function PATCH(request: Request) {
  try {
    const missing = missingR2Env();

    if (missing.length > 0) {
      return apiError(
        "DATABASE_ERROR",
        `Thiếu cấu hình R2: ${missing.join(", ")}`,
        500,
      );
    }

    const supabase =
      await createSupabaseServerClient();

    const user =
      await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để cập nhật ảnh đại diện",
        401,
      );
    }

    const body = await readJsonObject(request);

    const avatarUrl = String(
      body.avatar_url ?? "",
    ).trim();

    if (!avatarUrl) {
      return apiError(
        "INVALID_INPUT",
        "avatar_url là bắt buộc",
        400,
      );
    }

    const newAvatarKey =
      avatarKeyFromPublicUrl(
        avatarUrl,
        user.id,
      );

    if (!newAvatarKey) {
      return apiError(
        "INVALID_INPUT",
        "Ảnh đại diện không thuộc thư mục R2 hợp lệ của tài khoản",
        400,
      );
    }

    const previousAvatarUrl =
      await getCurrentAvatarUrl(supabase);

    const previousAvatarKey =
      avatarKeyFromPublicUrl(
        previousAvatarUrl,
        user.id,
      );

    const { data, error } =
      await supabase.rpc(
        "update_my_owner_profile_v1",
        {
          p_payload: {
            avatar_url: avatarUrl,
          },
        },
      );

    if (error) {
      return mapDatabaseError(error);
    }

    let cleanup: unknown = {
      deleted: false,
      reason: "same_object",
    };

    if (
      previousAvatarKey &&
      previousAvatarKey !== newAvatarKey
    ) {
      cleanup = await deleteR2Object(
        previousAvatarKey,
      );
    }

    return apiSuccess({
      avatar_url: avatarUrl,
      avatar_key: newAvatarKey,
      profile: data,
      cleanup,
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE() {
  try {
    const missing = missingR2Env();

    if (missing.length > 0) {
      return apiError(
        "DATABASE_ERROR",
        `Thiếu cấu hình R2: ${missing.join(", ")}`,
        500,
      );
    }

    const supabase =
      await createSupabaseServerClient();

    const user =
      await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để xóa ảnh đại diện",
        401,
      );
    }

    const previousAvatarUrl =
      await getCurrentAvatarUrl(supabase);

    const previousAvatarKey =
      avatarKeyFromPublicUrl(
        previousAvatarUrl,
        user.id,
      );

    const { data, error } =
      await supabase.rpc(
        "update_my_owner_profile_v1",
        {
          p_payload: {
            avatar_url: null,
          },
        },
      );

    if (error) {
      return mapDatabaseError(error);
    }

    const cleanup =
      await deleteR2Object(previousAvatarKey);

    return apiSuccess({
      avatar_url: null,
      profile: data,
      cleanup,
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}