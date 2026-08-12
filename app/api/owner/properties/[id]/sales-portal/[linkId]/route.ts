import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await params;
    const propertyId = parseUuid(id, "property_id");
    const portalLinkId = parseUuid(linkId, "link_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
    if (permissionError) return mapDatabaseError(permissionError);
    if (canManage !== true) return apiError("FORBIDDEN", "Bạn không có quyền thu hồi link này", 403);
    const { data, error } = await supabase.from("sales_portal_links").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", portalLinkId).eq("property_id", propertyId).is("revoked_at", null).select("id").maybeSingle();
    if (error) return mapDatabaseError(error);
    if (!data) return apiError("NOT_FOUND", "Link không tồn tại hoặc đã được thu hồi", 404);
    return apiSuccess({ revoked: true });
  } catch (error) { return mapUnknownError(error); }
}
