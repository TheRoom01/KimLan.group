import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const propertyId = parseUuid((await params).id, "property_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await supabase.rpc("sync_property_defaults_from_latest_room_v1", { p_property_id: propertyId });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
