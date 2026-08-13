import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject, RequestValidationError } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authorizedContext(rawPropertyId: string, rawLinkId: string) {
  const propertyId = parseUuid(rawPropertyId, "property_id");
  const linkId = parseUuid(rawLinkId, "link_id");
  const supabase = await createSupabaseServerClient();
  if (!await getAuthenticatedUser(supabase)) return { error: apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401) } as const;
  const { data: canManage, error } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
  if (error) return { error: mapDatabaseError(error) } as const;
  if (canManage !== true) return { error: apiError("FORBIDDEN", "Bạn không có quyền quản lý link này", 403) } as const;
  return { propertyId, linkId, supabase } as const;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await params;
    const ctx = await authorizedContext(id, linkId);
    if ("error" in ctx) return ctx.error;
    const body = await readJsonObject(request);
    if (!Array.isArray(body.document_ids)) throw new RequestValidationError("Danh sách tài liệu không hợp lệ");
    const documentIds = Array.from(new Set(body.document_ids.map((value) => parseUuid(value, "document_id"))));
    const { data: link, error: linkError } = await ctx.supabase.from("sales_portal_links").select("id").eq("id", ctx.linkId).eq("property_id", ctx.propertyId).maybeSingle();
    if (linkError) return mapDatabaseError(linkError);
    if (!link) return apiError("NOT_FOUND", "Không tìm thấy link Sale", 404);
    if (documentIds.length) {
      const { count, error } = await ctx.supabase.from("property_documents").select("id", { count: "exact", head: true }).eq("property_id", ctx.propertyId).in("id", documentIds);
      if (error) return mapDatabaseError(error);
      if (count !== documentIds.length) return apiError("INVALID_INPUT", "Có tài liệu không thuộc tòa nhà này", 400);
    }
    const { data: previous, error: previousError } = await ctx.supabase.from("sales_portal_link_documents").select("document_id").eq("link_id", ctx.linkId);
    if (previousError) return mapDatabaseError(previousError);
    const { error: deleteError } = await ctx.supabase.from("sales_portal_link_documents").delete().eq("link_id", ctx.linkId);
    if (deleteError) return mapDatabaseError(deleteError);
    if (documentIds.length) {
      const { error: insertError } = await ctx.supabase.from("sales_portal_link_documents").insert(documentIds.map((documentId) => ({ link_id: ctx.linkId, document_id: documentId })));
      if (insertError) {
        if (previous?.length) await ctx.supabase.from("sales_portal_link_documents").insert(previous.map((item) => ({ link_id: ctx.linkId, document_id: item.document_id })));
        return mapDatabaseError(insertError);
      }
    }
    return apiSuccess({ document_ids: documentIds });
  } catch (error) { return mapUnknownError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await params;
    const ctx = await authorizedContext(id, linkId);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.supabase.from("sales_portal_links").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ctx.linkId).eq("property_id", ctx.propertyId).is("revoked_at", null).select("id").maybeSingle();
    if (error) return mapDatabaseError(error);
    if (!data) return apiError("NOT_FOUND", "Link không tồn tại hoặc đã được thu hồi", 404);
    return apiSuccess({ revoked: true });
  } catch (error) { return mapUnknownError(error); }
}
