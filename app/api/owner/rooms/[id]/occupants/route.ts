import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseOptionalString,
  parseRequiredString,
  parseUuid,
  readJsonObject,
} from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawRoomId } = await params;
    const roomId = parseUuid(rawRoomId, "room_id");
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Bạn không có quyền thêm người ở cùng",
        authorization.status,
      );
    }

    const body = await readJsonObject(request);
    const fullName = parseRequiredString(body.full_name, "Họ tên", 200);
    const phone = parseOptionalString(body.phone, "Số điện thoại", 30);
    const cccd = parseOptionalString(body.cccd, "CCCD", 30);
    const { data, error } = await authorization.supabase.rpc(
      "add_owner_room_occupant_v1",
      {
        p_room_id: roomId,
        p_full_name: fullName,
        p_phone: phone,
        p_cccd: cccd,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
