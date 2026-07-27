import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để xem thông tin tài khoản",
        401,
      );
    }

    const [
      panelResponse,
      avatarResponse,
    ] = await Promise.all([
      supabase.rpc(
        "get_owner_account_panel_v1",
      ),

      supabase.rpc(
        "get_owner_member_avatars_v1",
      ),
    ]);

    if (panelResponse.error) {
      return mapDatabaseError(
        panelResponse.error,
      );
    }

    if (avatarResponse.error) {
      return mapDatabaseError(
        avatarResponse.error,
      );
    }

    const panel =
      panelResponse.data &&
      typeof panelResponse.data ===
        "object" &&
      !Array.isArray(
        panelResponse.data,
      )
        ? {
            ...panelResponse.data,
          }
        : {};

    const avatarRows =
      Array.isArray(avatarResponse.data)
        ? avatarResponse.data
        : [];

    const avatarByUserId =
      new Map<string, string | null>();

    for (const candidate of avatarRows) {
      if (
        !candidate ||
        typeof candidate !== "object"
      ) {
        continue;
      }

      const row =
        candidate as Record<
          string,
          unknown
        >;

      const userId =
        typeof row.user_id === "string"
          ? row.user_id
          : null;

      const avatarUrl =
        typeof row.avatar_url === "string"
          ? row.avatar_url
          : null;

      if (userId) {
        avatarByUserId.set(
          userId,
          avatarUrl,
        );
      }
    }

    const panelMembers =
      Array.isArray(
        (
          panel as {
            members?: unknown;
          }
        ).members,
      )
        ? (
            panel as {
              members: unknown[];
            }
          ).members
        : [];

    const members =
      panelMembers.map((candidate) => {
        if (
          !candidate ||
          typeof candidate !== "object"
        ) {
          return candidate;
        }

        const member =
          candidate as Record<
            string,
            unknown
          >;

        const userId =
          typeof member.user_id ===
          "string"
            ? member.user_id
            : "";

        return {
          ...member,

          avatar_url:
            avatarByUserId.get(
              userId,
            ) ?? null,
        };
      });

    return apiSuccess({
      ...panel,
      members,
    });

  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để cập nhật thông tin",
        401,
      );
    }

    const payload = await readJsonObject(request);

    const { data, error } = await supabase.rpc(
      "update_my_owner_profile_v1",
      {
        p_payload: payload,
      },
    );

    if (error) {
      return mapDatabaseError(error);
    }

    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}