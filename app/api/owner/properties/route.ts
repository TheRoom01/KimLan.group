import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { parseCreateOwnerPropertyInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

    const body = await readJsonObject(request);
    const payload = parseCreateOwnerPropertyInput(body);

    const { data, error } = await supabase.rpc(
      "create_owner_property_v1",
      { p_payload: payload },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
