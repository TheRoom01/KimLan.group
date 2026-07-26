import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data, error } = await supabase.rpc(
      "get_owner_dashboard_v1",
      {
        p_attention_limit: 10,
        p_activity_limit: 10,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
