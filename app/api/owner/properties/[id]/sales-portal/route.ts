import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseOptionalString, parseRequiredString, parseUuid, readJsonObject, RequestValidationError } from "@/lib/api/validation";
import { createSalesPortalToken, hashSalesPortalToken } from "@/lib/sales-portal/token";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseDocumentIds(value: unknown) {
  if (!Array.isArray(value)) throw new RequestValidationError("Danh sách tài liệu không hợp lệ");
  return Array.from(new Set(value.map((id) => parseUuid(id, "document_id"))));
}

async function context(rawId: string) {
  const propertyId = parseUuid(rawId, "property_id");
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { error: apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401) } as const;
  const { data: canManage, error } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
  if (error) return { error: mapDatabaseError(error) } as const;
  if (canManage !== true) return { error: apiError("FORBIDDEN", "Bạn không có quyền quản lý Sales Portal này", 403) } as const;
  return { propertyId, supabase, user } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await context(id);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.supabase.from("sales_portal_links").select("id,label,public_token,expires_at,revoked_at,last_accessed_at,created_at,sales_portal_link_documents(document_id)").eq("property_id", ctx.propertyId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error);
    return apiSuccess((data ?? []).map(({ sales_portal_link_documents: selections, ...link }) => ({
      ...link,
      document_ids: (selections ?? []).map((selection) => selection.document_id),
    })));
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await context(id);
    if ("error" in ctx) return ctx.error;
    const body = await readJsonObject(request);
    const label = parseRequiredString(body.label ?? "Sales Portal", "Tên link", 120);
    const expiresAt = parseOptionalString(body.expires_at, "Ngày hết hạn", 50);
    const documentIds = parseDocumentIds(body.document_ids ?? []);
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) throw new RequestValidationError("Ngày hết hạn không hợp lệ");
    if (expiresAt && new Date(expiresAt) <= new Date()) throw new RequestValidationError("Ngày hết hạn phải ở tương lai");
    if (documentIds.length) {
      const { count, error } = await ctx.supabase.from("property_documents").select("id", { count: "exact", head: true }).eq("property_id", ctx.propertyId).in("id", documentIds);
      if (error) return mapDatabaseError(error);
      if (count !== documentIds.length) return apiError("INVALID_INPUT", "Có tài liệu không thuộc tòa nhà này", 400);
    }
    const token = createSalesPortalToken();
    const { data, error } = await ctx.supabase.from("sales_portal_links").insert({ property_id: ctx.propertyId, token_hash: hashSalesPortalToken(token), public_token: token, label, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, created_by: ctx.user.id }).select("id,label,public_token,expires_at,created_at").single();
    if (error) return mapDatabaseError(error);
    if (documentIds.length) {
      const { error: selectionError } = await ctx.supabase.from("sales_portal_link_documents").insert(documentIds.map((documentId) => ({ link_id: data.id, document_id: documentId })));
      if (selectionError) {
        await ctx.supabase.from("sales_portal_links").delete().eq("id", data.id);
        return mapDatabaseError(selectionError);
      }
    }
    return apiSuccess({ ...data, token, path: `/sales/${token}` }, 201);
  } catch (error) { return mapUnknownError(error); }
}
