import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xem thông báo", 401);

    const [notificationsResult, unreadResult, suggestionsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, type, title, message, reference_id, reference_type, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      supabase.rpc("get_my_phone_property_suggestions_v1"),
    ]);

    if (notificationsResult.error) return mapDatabaseError(notificationsResult.error);
    if (unreadResult.error) return mapDatabaseError(unreadResult.error);
    if (suggestionsResult.error) return mapDatabaseError(suggestionsResult.error);

    return apiSuccess({
      notifications: notificationsResult.data ?? [],
      unread_count: unreadResult.count ?? 0,
      property_suggestions: Array.isArray(suggestionsResult.data?.suggestions)
        ? suggestionsResult.data.suggestions
        : [],
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xóa thông báo", 401);
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) return mapDatabaseError(error);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return mapUnknownError(error);
  }
}
