import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xem thông báo", 401);

    const [notificationsResult, unreadResult] = await Promise.all([
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
    ]);

    if (notificationsResult.error) return mapDatabaseError(notificationsResult.error);
    if (unreadResult.error) return mapDatabaseError(unreadResult.error);

    return apiSuccess({
      notifications: notificationsResult.data ?? [],
      unread_count: unreadResult.count ?? 0,
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}
