import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseOptionalString, parseRequiredString, parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = parseUuid((await params).id, "tenant_id");
    const body = await readJsonObject(request);
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);

    const dateOfBirth = parseOptionalString(body.date_of_birth, "Ngày sinh", 10);
    const { data, error } = await supabase.rpc("update_owner_tenant_profile_v1", {
      p_tenant_id: tenantId,
      p_full_name: parseRequiredString(body.full_name, "Họ tên", 200),
      p_phone: parseOptionalString(body.phone, "Số điện thoại", 30),
      p_cccd: parseOptionalString(body.cccd, "CCCD", 30),
      p_date_of_birth: dateOfBirth,
      p_address: parseOptionalString(body.address, "Địa chỉ", 500),
    });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = parseUuid((await params).id, "tenant_id");
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await supabase.rpc("delete_owner_tenant_v1", { p_tenant_id: tenantId });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
