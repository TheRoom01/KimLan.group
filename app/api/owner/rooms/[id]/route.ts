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
  RequestValidationError,
} from "@/lib/api/validation";
import { parseCreateOwnerRoomInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

const PUBLISH_STATUSES = new Set(["draft", "published", "hidden"]);

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
    const authorization = await authorizeRoomMutation(roomId);
    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Tài khoản đang đăng nhập chưa được cấp quyền chỉnh sửa phòng này",
        authorization.status,
      );
    }
    const supabase = authorization.supabase;

    const body = await readJsonObject(request);
    const input = parseCreateOwnerRoomInput(body);
    const publishStatus = String(body.publish_status ?? "draft").trim();

    if (!PUBLISH_STATUSES.has(publishStatus)) {
      throw new RequestValidationError("Trạng thái xuất bản không hợp lệ", {
        field: "publish_status",
      });
    }

    const { data, error } = await supabase.rpc(
      "update_owner_room_full_v2",
      {
        p_room_id: roomId,
        p_payload: {
          ...input,
          publish_status: publishStatus,
        },
      },
    );

    if (error) return mapDatabaseError(error);
    invalidatePublicRoomCache(roomId);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE(
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

    const permanent = new URL(request.url).searchParams.get("mode") === "permanent";
    const rpcName = permanent
      ? "delete_owner_room_permanently_v1"
      : "archive_owner_room_v1";
    const { data, error } = await supabase.rpc(rpcName, {
      p_room_id: roomId,
    });

    if (error) return mapDatabaseError(error);
    invalidatePublicRoomCache(roomId);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
