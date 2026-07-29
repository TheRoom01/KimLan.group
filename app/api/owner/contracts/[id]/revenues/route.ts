import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseDate, parseUuid, readJsonObject, RequestValidationError } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = parseUuid((await params).id, "contract_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await supabase.from("room_monthly_revenues").select("*").eq("contract_id", contractId).order("revenue_month");
    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? []);
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = parseUuid((await params).id, "contract_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const body = await readJsonObject(request);
    const revenueMonth = monthStart(body.revenue_month);
    const { data: contract, error: contractError } = await supabase.from("rental_contracts")
      .select("id, room_id, monthly_price, deposit_amount, rooms!inner(id, room_code, property_id)")
      .eq("id", contractId).single();
    if (contractError) return mapDatabaseError(contractError);
    const room = Array.isArray(contract.rooms) ? contract.rooms[0] : contract.rooms;
    if (!room?.property_id) return apiError("CONFLICT", "Hợp đồng chưa gắn với tòa nhà", 409);
    const values = editableValues(body);
    const { data, error } = await supabase.from("room_monthly_revenues").insert({
      property_id: room.property_id, room_id: room.id, contract_id: contractId, revenue_month: revenueMonth,
      room_code: room.room_code, deposit_amount: Number(contract.deposit_amount ?? 0),
      rent_amount: Number(contract.monthly_price ?? 0), created_by: user.id, ...values,
    }).select("*").single();
    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) { return mapUnknownError(error); }
}

function monthStart(value: unknown) {
  const date = parseDate(value, "Tháng doanh thu");
  if (!date.endsWith("-01")) throw new RequestValidationError("Tháng doanh thu phải là ngày đầu tháng");
  return date;
}

function editableValues(body: Record<string, unknown>) {
  const number = (key: string) => {
    const value = Number(body[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new RequestValidationError(`${key} phải là số không âm`);
    return value;
  };
  const start = number("electricity_start");
  const end = number("electricity_end");
  if (end < start) throw new RequestValidationError("Số điện cuối không được nhỏ hơn số điện đầu");
  const status = String(body.status ?? "draft");
  if (!["draft", "confirmed", "paid"].includes(status)) throw new RequestValidationError("Trạng thái doanh thu không hợp lệ");
  return { electricity_start: start, electricity_end: end, electricity_unit_price: number("electricity_unit_price"),
    water_fee: number("water_fee"), service_fee: number("service_fee"), other_fee: number("other_fee"),
    note: String(body.note ?? "").trim().slice(0, 5000) || null, status };
}
