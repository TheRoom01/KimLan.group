import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statuses = ["holding", "awaiting_checkin", "checked_in", "cancelled"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const contractId = parseUuid((await params).id, "contract_id");
    const body = await readJsonObject(request);
    const status = String(body.booking_status ?? "");
    if (!statuses.includes(status as (typeof statuses)[number])) return apiError("INVALID_INPUT", "Trạng thái đặt cọc không hợp lệ", 400);
    const { data, error } = await supabase.rpc("update_owner_booking_status_v1", { p_contract_id: contractId, p_booking_status: status });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}
