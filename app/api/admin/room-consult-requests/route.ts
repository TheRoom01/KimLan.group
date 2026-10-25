import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES = ["new", "contacted", "scheduled", "completed", "cancelled"] as const;
type RequestStatus = (typeof STATUSES)[number];
const REQUEST_TYPES = ["consultation", "viewing"] as const;
type RequestType = (typeof REQUEST_TYPES)[number];
const PAGE_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeRequestViewer() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { supabase, error: apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401) };
  const { data, error } = await supabase.rpc("get_my_admin_level");
  const level = Number(data ?? 0);
  if (!error && (level === 1 || level === 2)) return { supabase, error: null };

  const { data: membership, error: membershipError } = await supabase
    .from("property_members")
    .select("property_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("role", ["owner", "manager"])
    .limit(1);
  if (membershipError || !membership?.length) {
    return { supabase, error: apiError("FORBIDDEN", "Bạn không có quyền xem yêu cầu phòng", 403) };
  }
  return { supabase, error: null };
}

export async function GET(request: Request) {
  const { supabase, error: authError } = await authorizeRequestViewer();
  if (authError) return authError;
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const requestType = params.get("request_type");
  const requestId = params.get("request_id");
  const pageRaw = Number(params.get("page") ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 100_000) : 1;
  if (status && status !== "all" && !STATUSES.includes(status as RequestStatus)) {
    return apiError("INVALID_INPUT", "Trạng thái không hợp lệ", 400);
  }
  if (requestType && requestType !== "all" && !REQUEST_TYPES.includes(requestType as RequestType)) {
    return apiError("INVALID_INPUT", "Loại yêu cầu không hợp lệ", 400);
  }
  if (requestId && !UUID_RE.test(requestId)) return apiError("INVALID_INPUT", "Mã yêu cầu không hợp lệ", 400);
  let query = supabase.from("room_consult_requests")
    .select("id, room_id, assigned_admin_id, room_code_snapshot, room_type_snapshot, address_snapshot, price_snapshot, guest_name, guest_phone, request_type, viewing_date, preferred_time, notes, status, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status && status !== "all") query = query.eq("status", status);
  if (requestType && requestType !== "all") query = query.eq("request_type", requestType);
  if (requestId) query = query.eq("id", requestId);
  const { data, error, count } = await query;
  if (error) return mapDatabaseError(error);
  return apiSuccess({ requests: data ?? [], total: count ?? 0, page, page_size: PAGE_SIZE });
}

export async function PATCH(request: Request) {
  const { supabase, error: authError } = await authorizeRequestViewer();
  if (authError) return authError;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id ?? "").trim();
  const status = String(body?.status ?? "").trim();
  if (!UUID_RE.test(id) || !STATUSES.includes(status as RequestStatus)) {
    return apiError("INVALID_INPUT", "Thông tin cập nhật không hợp lệ", 400);
  }
  const { data, error } = await supabase.from("room_consult_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status, updated_at")
    .maybeSingle();
  if (error) return mapDatabaseError(error);
  if (!data) return apiError("NOT_FOUND", "Không tìm thấy yêu cầu hoặc bạn không có quyền xử lý", 404);
  return apiSuccess(data);
}
