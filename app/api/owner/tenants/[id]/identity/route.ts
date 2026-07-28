import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseOptionalString,
  parseUuid,
  readJsonObject,
} from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

function validR2Url(value: string | null) {
  const base = String(process.env.R2_PUBLIC_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");

  return !value || !base || value.startsWith(`${base}/`);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawTenantId } = await params;
    const tenantId = parseUuid(rawTenantId, "tenant_id");
    const body = await readJsonObject(request);
    const roomId = parseUuid(String(body.room_id ?? ""), "room_id");
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Bạn không có quyền cập nhật CCCD của khách thuê",
        authorization.status,
      );
    }

    const frontUrl = parseOptionalString(
      body.cccd_front_url,
      "Ảnh CCCD mặt trước",
      3000,
    );
    const backUrl = parseOptionalString(
      body.cccd_back_url,
      "Ảnh CCCD mặt sau",
      3000,
    );
    const frontPath = parseOptionalString(
      body.cccd_front_path,
      "Đường dẫn CCCD mặt trước",
      2000,
    );
    const backPath = parseOptionalString(
      body.cccd_back_path,
      "Đường dẫn CCCD mặt sau",
      2000,
    );

    if (!validR2Url(frontUrl) || !validR2Url(backUrl)) {
      return apiError(
        "INVALID_INPUT",
        "Ảnh CCCD phải thuộc kho lưu trữ R2 đã cấu hình",
        400,
      );
    }

    const { data, error } = await authorization.supabase.rpc(
      "update_owner_tenant_identity_v1",
      {
        p_room_id: roomId,
        p_tenant_id: tenantId,
        p_cccd_front_url: frontUrl,
        p_cccd_front_path: frontPath,
        p_cccd_back_url: backUrl,
        p_cccd_back_path: backPath,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
