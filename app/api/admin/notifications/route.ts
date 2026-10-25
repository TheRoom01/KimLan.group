import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAdminContext() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return {
      supabase,
      user: null,
      error: apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401),
    };
  }

  const { data, error } = await supabase.rpc("get_my_admin_level");
  const level = Number(data ?? 0);

  if (error || (level !== 1 && level !== 2)) {
    return {
      supabase,
      user: null,
      error: apiError(
        "FORBIDDEN",
        "Bạn không có quyền xem thông báo Admin",
        403,
      ),
    };
  }

  return { supabase, user, error: null };
}

export async function GET(request: Request) {
  const { supabase, user, error: authError } = await getAdminContext();

  if (authError || !user) return authError;

  const params = new URL(request.url).searchParams;
  const pageRaw = Number(params.get("page") ?? "1");
  const page =
    Number.isInteger(pageRaw) && pageRaw > 0
      ? Math.min(pageRaw, 100_000)
      : 1;
  const pageSize = 30;

  const [itemsResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, type, title, message, reference_id, reference_type, is_read, created_at",
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  if (itemsResult.error) return mapDatabaseError(itemsResult.error);
  if (unreadResult.error) return mapDatabaseError(unreadResult.error);

  return apiSuccess({
    notifications: itemsResult.data ?? [],
    unread_count: unreadResult.count ?? 0,
    total: itemsResult.count ?? 0,
    page,
    page_size: pageSize,
  });
}

export async function PATCH(request: Request) {
  const { supabase, user, error: authError } = await getAdminContext();

  if (authError || !user) return authError;

  // Đã sửa: sử dụng đúng tham số request.
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (body?.mark_all_read === true) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) return mapDatabaseError(error);

    return apiSuccess({ updated: true });
  }

  if (Array.isArray(body?.ids)) {
    const ids = [...new Set(body.ids.map((value) => String(value).trim()))];

    if (
      !ids.length ||
      ids.length > 30 ||
      ids.some((id) => !UUID_RE.test(id))
    ) {
      return apiError(
        "INVALID_INPUT",
        "Danh sách thông báo không hợp lệ",
        400,
      );
    }

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .in("id", ids)
      .select("id");

    if (error) return mapDatabaseError(error);

    return apiSuccess({
      updated_ids: (data ?? []).map((item) => item.id),
    });
  }

  const id = String(body?.id ?? "").trim();

  if (!UUID_RE.test(id)) {
    return apiError("INVALID_INPUT", "Mã thông báo không hợp lệ", 400);
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return mapDatabaseError(error);
  if (!data) {
    return apiError("NOT_FOUND", "Không tìm thấy thông báo", 404);
  }

  return apiSuccess({ updated: true });
}

export async function DELETE(request: Request) {
  const { supabase, user, error: authError } = await getAdminContext();

  if (authError || !user) return authError;

  // Đã sửa: sử dụng đúng tham số request.
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map((value) => String(value).trim()))]
    : [];

  if (
    !ids.length ||
    ids.length > 30 ||
    ids.some((id) => !UUID_RE.test(id))
  ) {
    return apiError(
      "INVALID_INPUT",
      "Danh sách thông báo không hợp lệ",
      400,
    );
  }

  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids)
    .select("id");

  if (error) return mapDatabaseError(error);

  return apiSuccess({
    deleted_ids: (data ?? []).map((item) => item.id),
  });
}