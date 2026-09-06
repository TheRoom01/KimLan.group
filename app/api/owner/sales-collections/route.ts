import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseRequiredString, parseOptionalString, parseUuid, readJsonObject, RequestValidationError } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSalesPortalToken, hashSalesPortalToken } from "@/lib/sales-portal/token";
import { MAX_SHARED_BUILDINGS } from "@/lib/sales-portal/collection";
import { revokedLinkCutoff } from "@/lib/sales-portal/linkLifecycle";

const fields = "id,label,public_token,link_ids,created_at,expires_at,revoked_at";

export async function GET() {
  try {
    const db = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(db);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await db.from("sales_portal_collections").select(fields).eq("created_by", user.id).or(`revoked_at.is.null,revoked_at.gt.${revokedLinkCutoff()}`).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(request: Request) { return saveCollection(request, false); }
export async function PUT(request: Request) { return saveCollection(request, true); }

async function saveCollection(request: Request, editing: boolean) {
  try {
    const db = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(db);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const collectionId = editing ? parseUuid(new URL(request.url).searchParams.get("id"), "id") : null;
    const body = await readJsonObject(request);
    const label = parseRequiredString(body.label, "Tên link", 120);
    const expiry = parseOptionalString(body.expires_at, "Ngày hết hạn", 50);
    if (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now())) throw new RequestValidationError("Ngày hết hạn phải ở tương lai");
    if (!Array.isArray(body.link_ids) || !body.link_ids.length || body.link_ids.length > MAX_SHARED_BUILDINGS) throw new RequestValidationError("Danh sách link không hợp lệ");
    const ids = [...new Set(body.link_ids.map((id) => parseUuid(id, "link_id")))];
    // The session client's RLS checks can_manage_property for every underlying link.
    const { data: links, error } = await db.from("sales_portal_links").select("id,property_id,public_token,expires_at,revoked_at").in("id", ids);
    if (error) return mapDatabaseError(error);
    if (!links || links.length !== ids.length) return apiError("FORBIDDEN", "Bạn không có quyền chia sẻ một trong các tòa nhà", 403);
    if (links.some((link) => !link.public_token || link.revoked_at || (link.expires_at && Date.parse(link.expires_at) <= Date.now()))) throw new RequestValidationError("Có link đã hết hạn hoặc bị thu hồi. Vui lòng tải lại danh sách.");
    if (new Set(links.map((link) => link.property_id)).size !== links.length) throw new RequestValidationError("Mỗi tòa nhà chỉ được chọn một link");
    if (collectionId) {
      const { data, error: saveError } = await createSupabaseAdminClient().from("sales_portal_collections")
        .update({ link_ids: ids }).eq("id", collectionId).eq("created_by", user.id)
        .is("revoked_at", null).select(fields).maybeSingle();
      if (saveError) return mapDatabaseError(saveError);
      if (!data) return apiError("NOT_FOUND", "Link không tồn tại hoặc đã bị thu hồi", 404);
      return apiSuccess(data);
    }
    const token = createSalesPortalToken();
    const { data, error: saveError } = await createSupabaseAdminClient().from("sales_portal_collections").insert({
      label, link_ids: ids, created_by: user.id, expires_at: expiry || null,
      public_token: token, token_hash: hashSalesPortalToken(token),
    }).select(fields).single();
    if (saveError) return mapDatabaseError(saveError);
    return apiSuccess(data, 201);
  } catch (error) { return mapUnknownError(error); }
}

export async function DELETE(request: Request) {
  try {
    const db = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(db);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const id = parseUuid(new URL(request.url).searchParams.get("id"), "id");
    const { data, error } = await createSupabaseAdminClient().from("sales_portal_collections")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("created_by", user.id).is("revoked_at", null).select("id").maybeSingle();
    if (error) return mapDatabaseError(error);
    if (!data) return apiError("NOT_FOUND", "Không tìm thấy link", 404);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}

export async function PATCH(request: Request) {
  try {
    const db = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(db);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const id = parseUuid(new URL(request.url).searchParams.get("id"), "id");
    const { data, error } = await createSupabaseAdminClient().from("sales_portal_collections")
      .update({ revoked_at: null }).eq("id", id).eq("created_by", user.id)
      .gt("revoked_at", revokedLinkCutoff()).select(fields).maybeSingle();
    if (error) return mapDatabaseError(error);
    if (!data) return apiError("NOT_FOUND", "Link không tồn tại hoặc đã quá 3 ngày khôi phục", 404);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}
