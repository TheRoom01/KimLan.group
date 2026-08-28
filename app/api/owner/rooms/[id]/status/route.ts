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
import { parseUpdateOwnerRoomStatusInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const roomId = parseUuid(rawId, "room_id");
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
    const input = parseUpdateOwnerRoomStatusInput(body);

    const { data, error } = await supabase.rpc(
      "update_owner_room_status_v1",
      {
        p_room_id: roomId,
        p_new_status: input.status,
        p_note: input.note,
      },
    );

    if (error) return mapDatabaseError(error);
    invalidatePublicRoomCache(roomId);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
