import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject, RequestValidationError } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; revenueId: string }> }) {
  try {
    const values = await params;
    const contractId = parseUuid(values.id, "contract_id");
    const revenueId = parseUuid(values.revenueId, "revenue_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const body = await readJsonObject(request);
    const { data, error } = await supabase.from("room_monthly_revenues").update(editableValues(body))
      .eq("id", revenueId).eq("contract_id", contractId).select("*").single();
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; revenueId: string }> }) {
  try {
    const values = await params;
    const contractId = parseUuid(values.id, "contract_id");
    const revenueId = parseUuid(values.revenueId, "revenue_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await supabase.from("room_monthly_revenues").delete().eq("id", revenueId).eq("contract_id", contractId).select("id").single();
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}

function editableValues(body: Record<string, unknown>) {
  const number = (key: string) => {
    const value = Number(body[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new RequestValidationError(`${key} phải là số không âm`);
    return value;
  };
  const start = number("electricity_start"), end = number("electricity_end");
  if (end < start) throw new RequestValidationError("Số điện cuối không được nhỏ hơn số điện đầu");
  const status = String(body.status ?? "draft");
  if (!["draft", "confirmed", "paid"].includes(status)) throw new RequestValidationError("Trạng thái doanh thu không hợp lệ");
  return { electricity_start: start, electricity_end: end, electricity_unit_price: number("electricity_unit_price"), water_fee: number("water_fee"), service_fee: number("service_fee"), other_fee: number("other_fee"), note: String(body.note ?? "").trim().slice(0, 5000) || null, status };
}
