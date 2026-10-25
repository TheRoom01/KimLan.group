import { apiError, apiSuccess } from "@/lib/api/response";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRegistrationClientIp, verifyTurnstileToken } from "@/lib/owner/registrationSecurity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?[0-9().\s-]{8,24}$/;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return apiError("FORBIDDEN", "Nguồn gửi yêu cầu không hợp lệ", 403);
      }
    } catch {
      return apiError("FORBIDDEN", "Nguồn gửi yêu cầu không hợp lệ", 403);
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_000) return apiError("INVALID_INPUT", "Nội dung yêu cầu quá lớn", 413);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("INVALID_INPUT", "Dữ liệu yêu cầu không hợp lệ", 400);
  }

  const requestKey = String(body.request_key ?? "").trim();
  const roomId = String(body.room_id ?? "").trim();
  const name = String(body.guest_name ?? "").trim();
  const phone = String(body.guest_phone ?? "").trim();
  const requestType = String(body.request_type ?? "").trim();
  const viewingDateRaw = body.viewing_date == null ? "" : String(body.viewing_date).trim();
  const preferredTime = body.preferred_time == null ? "" : String(body.preferred_time).trim();
  const notes = body.notes == null ? "" : String(body.notes).trim();
  const captchaToken = body.captcha_token == null ? "" : String(body.captcha_token).trim();

  if (String(body.website ?? "").trim()) return apiError("INVALID_INPUT", "Không thể xác thực yêu cầu", 400);
  if (!UUID_RE.test(requestKey) || !UUID_RE.test(roomId)) return apiError("INVALID_INPUT", "Thông tin phòng không hợp lệ", 400);
  if (name.length < 2 || name.length > 120) return apiError("INVALID_INPUT", "Họ tên cần có từ 2 đến 120 ký tự", 400);
  if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 9 || phone.replace(/\D/g, "").length > 14) {
    return apiError("INVALID_INPUT", "Số điện thoại chưa đúng định dạng", 400);
  }
  if (requestType !== "consultation" && requestType !== "viewing") return apiError("INVALID_INPUT", "Nhu cầu không hợp lệ", 400);
  if (requestType === "viewing") {
    const parsedDate = new Date(`${viewingDateRaw}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(viewingDateRaw) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== viewingDateRaw) {
      return apiError("INVALID_INPUT", "Ngày xem phòng chưa hợp lệ", 400);
    }
    const todayInVietnam = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    if (viewingDateRaw < todayInVietnam) return apiError("INVALID_INPUT", "Ngày xem phòng không thể ở quá khứ", 400);
  }
  if (preferredTime.length > 80 || notes.length > 2000) return apiError("INVALID_INPUT", "Ghi chú hoặc khung giờ quá dài", 400);
  if (!captchaToken || captchaToken.length > 4096 || !(await verifyTurnstileToken(
    captchaToken,
    getRegistrationClientIp(request),
    new URL(request.url).hostname,
  ))) {
    return apiError("INVALID_INPUT", "Vui lòng xác minh CAPTCHA rồi thử lại.", 400);
  }

  try {
    // This RPC is intentionally executable only by service_role. The public
    // route verifies Turnstile first, then calls it with the server-only key.
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("submit_room_consult_request_v1", {
      p_request_key: requestKey,
      p_room_id: roomId,
      p_guest_name: name,
      p_guest_phone: phone,
      p_request_type: requestType,
      p_viewing_date: requestType === "viewing" ? viewingDateRaw : null,
      p_preferred_time: requestType === "viewing" ? preferredTime || null : null,
      p_notes: notes || null,
    });

    if (error) {
      const errorCode = String(error.code ?? "UNKNOWN");
      const message = `${error.message} ${error.details ?? ""}`.toUpperCase();
      if (errorCode === "PGRST202" || errorCode === "42883") {
        console.error("Room consultation RPC is unavailable", { code: errorCode });
        return apiError("DATABASE_ERROR", "Hệ thống tiếp nhận yêu cầu đang được cập nhật. Vui lòng thử lại sau.", 503);
      }
      if (errorCode === "42P01") {
        console.error("Room consultation storage is unavailable", { code: errorCode });
        return apiError("DATABASE_ERROR", "Hệ thống tiếp nhận yêu cầu đang được cập nhật. Vui lòng thử lại sau.", 503);
      }
      if (message.includes("ROOM_NOT_AVAILABLE") || error.code === "P0002") {
        return apiError("NOT_FOUND", "Phòng này hiện không nhận yêu cầu", 404);
      }
      if (message.includes("INVALID_") || error.code === "22023") {
        return apiError("INVALID_INPUT", "Thông tin gửi chưa hợp lệ. Vui lòng kiểm tra lại.", 400);
      }
      if (message.includes("NO_ADMIN_RECIPIENT")) {
        return apiError("DATABASE_ERROR", "Chưa tìm thấy bộ phận phụ trách phòng này. Vui lòng liên hệ trực tiếp.", 503);
      }
      if (message.includes("RATE_LIMITED")) {
        return apiError("INVALID_INPUT", "Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.", 429);
      }
      // Do not log PostgREST message/details: constraint diagnostics can include
      // submitted guest fields such as the name or phone number.
      console.error("Room consultation RPC failed", { code: errorCode });
      return apiError("DATABASE_ERROR", "Chưa lưu được yêu cầu. Vui lòng thử lại sau.", 503);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.request_id || (row.duplicate !== true && Number(row.notified_admins ?? 0) < 1)) {
      return apiError("DATABASE_ERROR", "Chưa xác nhận được người nhận yêu cầu. Vui lòng thử lại sau.", 503);
    }

    return apiSuccess({
      request_id: row.request_id as string,
      duplicate: row.duplicate === true,
      notified_admins: Number(row.notified_admins),
    }, row.duplicate === true ? 200 : 201);
  } catch (error) {
    console.error("Room consultation request unavailable", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return apiError("DATABASE_ERROR", "Dịch vụ đang bận. Vui lòng thử lại sau.", 503);
  }
}
