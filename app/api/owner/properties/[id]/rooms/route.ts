import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseCreateOwnerRoomInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const propertyId = parseUuid(rawId, "property_id");
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
    const payload = parseCreateOwnerRoomInput(body);

    const { data, error } = await supabase.rpc(
      "create_owner_room_v2",
      {
        p_property_id: propertyId,
        p_payload: payload,
      },
    );

    if (error) return mapDatabaseError(error);

    if (
      data &&
      typeof data === "object" &&
      "mode" in data &&
      data.mode === "existing"
    ) {

      return apiSuccess(data, 200);

    }


    return apiSuccess(data,201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
