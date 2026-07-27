import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseUuid,
  readJsonObject,
} from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      userId: string;
    }>;
  },
) {
  try {
    const { userId: rawUserId } = await params;
    const memberUserId = parseUuid(
      rawUserId,
      "member_user_id",
    );

    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để cập nhật thành viên",
        401,
      );
    }

    const payload = await readJsonObject(request);

    const { data, error } = await supabase.rpc(
      "update_owner_member_contact_v1",
      {
        p_member_user_id: memberUserId,
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