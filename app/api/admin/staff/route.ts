import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function authorizeStaffManagement() {
  const db = await createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 }) };
  const { data: level, error: levelError } = await db.rpc("get_my_admin_level");
  if (levelError || level !== 1) return { response: NextResponse.json({ error: "Chỉ Admin L1 được quản lý tài khoản NV." }, { status: 403 }) };
  return { db, user };
}

export async function GET() {
  const auth = await authorizeStaffManagement();
  if (auth.response) return auth.response;
  const { data, error } = await auth.db!.rpc("list_staff_accounts");
  if (error) return NextResponse.json({ error: "Không tải được danh sách tài khoản." }, { status: 500 });
  return NextResponse.json({ accounts: data, current_user_id: auth.user!.id }, { headers: { "Cache-Control": "no-store" } });
}

async function manage(request: NextRequest, action: "delete" | "role") {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  const auth = await authorizeStaffManagement();
  if (auth.response) return auth.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 }); }
  if (typeof body?.user_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id) || ![1, 2].includes(body.expected_level) || (action === "role" && ![1, 2].includes(body.level))) {
    return NextResponse.json({ error: "Tài khoản hoặc cấp quyền không hợp lệ." }, { status: 400 });
  }
  const { error } = await auth.db!.rpc("manage_staff_account", { p_user_id: body.user_id, p_action: action, p_level: action === "role" ? body.level : null, p_expected_level: body.expected_level });
  if (error) {
    const messages: Record<string, string> = {
      STAFF_FORBIDDEN: "Chỉ Admin L1 được quản lý tài khoản NV.",
      STAFF_SELF_CHANGE: "Không được xóa hoặc thay đổi quyền tài khoản đang sử dụng.",
      STAFF_LAST_L1: "Không thể xóa hoặc hạ quyền Admin L1 cuối cùng.",
      STAFF_NOT_FOUND: "Tài khoản không còn trong danh sách Admin. Hãy tải lại danh sách.",
      STAFF_CONFLICT: "Quyền tài khoản đã thay đổi. Hãy tải lại danh sách trước khi thao tác.",
    };
    return NextResponse.json({ error: messages[error.message] ?? "Không cập nhật được tài khoản. Vui lòng tải lại danh sách." }, { status: error.message === "STAFF_FORBIDDEN" ? 403 : 409 });
  }
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) { return manage(request, "role"); }
export async function DELETE(request: NextRequest) { return manage(request, "delete"); }

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  }
  const db = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  const { data: level, error: levelError } = await db.rpc("get_my_admin_level");
  if (levelError || level !== 1) return NextResponse.json({ error: "Chỉ Admin L1 được cấp tài khoản." }, { status: 403 });

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const existing = body?.existing === true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !fullName || fullName.length > 150 || !/^\+?[0-9 ()-]{8,25}$/.test(phone) || ![1, 2].includes(body?.level) || (!existing && (password.length < 8 || password.length > 128))) {
    return NextResponse.json({ error: "Kiểm tra email, họ tên, SĐT, cấp quyền và mật khẩu (8–128 ký tự)." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  let createdId: string | null = null;
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.code === "email_exists" || error?.code === "email_already_exists" ? "Email đã tồn tại. Chọn cấp quyền cho tài khoản có sẵn." : "Không tạo được tài khoản. Kiểm tra email và yêu cầu mật khẩu của dự án." }, { status: 400 });
    }
    createdId = data.user.id;
  }
  const { data, error } = await db.rpc("grant_staff_account", {
    p_email: email, p_full_name: fullName, p_phone: phone, p_level: body.level,
  });
  if (error) {
    // Only compensate a definite database rejection. A transport failure may
    // arrive after the grant committed, so deleting that user would be unsafe.
    let retainedAccount = Boolean(createdId);
    if (createdId && /^[0-9A-Z]{5}$/.test(error.code ?? "")) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(createdId);
      if (cleanupError) console.error("Staff account cleanup failed", createdId, cleanupError.code);
      else retainedAccount = false;
    }
    const messages: Record<string, string> = {
      STAFF_ALREADY_ADMIN: "Tài khoản đã có quyền Admin; không thay đổi cấp quyền hiện tại.",
      STAFF_USER_NOT_FOUND: "Không tìm thấy email đăng nhập. Hãy chọn tạo tài khoản mới.",
      STAFF_FORBIDDEN: "Chỉ Admin L1 được cấp tài khoản.",
    };
    return NextResponse.json({ error: retainedAccount
      ? "Đã tạo email đăng nhập nhưng chưa xác nhận được kết quả cấp quyền. Chọn cấp quyền cho tài khoản có sẵn để kiểm tra/cấp lại."
      : messages[error.message] ?? "Không cấp được quyền. Vui lòng thử lại." }, { status: error.message === "STAFF_FORBIDDEN" ? 403 : 400 });
  }
  return NextResponse.json({ account: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
