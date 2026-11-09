import { after } from "next/server";
import { pushConfig, sendEventPush } from "@/lib/notifications/webPush";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để nhận quyền tòa nhà", 401);

    const body = await readJsonObject(request);
    const propertyId = parseUuid(String(body.property_id ?? ""), "property_id");
    const role = String(body.role ?? "").trim().toLowerCase();
    if (role !== "owner" && role !== "manager") {
      return apiError("INVALID_INPUT", "Quyền yêu cầu không hợp lệ", 400);
    }

    const { data, error } = await supabase.rpc("request_my_phone_property_access_v1", {
      p_property_id: propertyId,
      p_role: role,
    });
    if (error) return mapDatabaseError(error);
    if (data?.mode === "access_granted" && pushConfig()) {
      after(() => sendEventPush(new URL(request.url).origin, { type: "property_access_granted", id: propertyId, userId: user.id }));
    }
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
