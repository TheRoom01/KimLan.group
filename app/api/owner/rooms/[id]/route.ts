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
import { parseUpdateOwnerRoomInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const input = parseUpdateOwnerRoomInput(body);

    const { data, error } = await supabase.rpc(
      "update_owner_room_v1",
      {
        p_room_id: roomId,
        p_room_type: input.room_type,
        p_price: input.price,
        p_description: input.description,
        p_status: null,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE(
  _request: Request,
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

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, property_id, lifecycle_status")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError) return mapDatabaseError(roomError);
    if (!room) return apiError("NOT_FOUND", "Không tìm thấy phòng", 404);

    if (room.lifecycle_status === "archived") {
      return apiSuccess(room);
    }

    if (!room.property_id) {
      return apiError(
        "CONFLICT",
        "Phòng không thuộc tòa nhà hợp lệ",
        409,
      );
    }

    const { data: canArchive, error: permissionError } = await supabase.rpc(
      "can_archive_property",
      { p_property_id: room.property_id },
    );

    if (permissionError) return mapDatabaseError(permissionError);
    if (canArchive !== true) {
      return apiError(
        "FORBIDDEN",
        "Chỉ owner của tòa nhà mới được lưu trữ phòng",
        403,
      );
    }

    const { data, error } = await supabase
      .from("rooms")
      .update({ lifecycle_status: "archived" })
      .eq("id", roomId)
      .select("id, lifecycle_status, publish_status, archived_at, archived_by")
      .single();

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
