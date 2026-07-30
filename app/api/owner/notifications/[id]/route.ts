import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để cập nhật thông báo", 401);

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, is_read")
      .maybeSingle();

    if (error) return mapDatabaseError(error);
    if (!data) return apiError("NOT_FOUND", "Không tìm thấy thông báo", 404);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
