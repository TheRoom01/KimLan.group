import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PropertySuggestion = {
  id: string;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
  has_owner?: boolean;
  pending_role?: "owner" | "manager" | null;
  match_source?: "property" | "room" | null;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xem thông báo", 401);

    const { error: bookingNotificationError } = await supabase.rpc("create_my_booking_deadline_notifications_v1");
    if (bookingNotificationError) return mapDatabaseError(bookingNotificationError);

    const [notificationsResult, unreadResult, suggestionsResult, dismissalsResult] = await Promise.all([
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
      supabase.from("property_suggestion_dismissals").select("property_id").eq("user_id", user.id),
    ]);

    if (notificationsResult.error) return mapDatabaseError(notificationsResult.error);
    if (unreadResult.error) return mapDatabaseError(unreadResult.error);
    if (suggestionsResult.error) return mapDatabaseError(suggestionsResult.error);
    if (dismissalsResult.error) return mapDatabaseError(dismissalsResult.error);

    const dismissed = new Set((dismissalsResult.data ?? []).map((item) => item.property_id));
    const suggestionNotifications = ((Array.isArray(suggestionsResult.data?.suggestions)
      ? suggestionsResult.data.suggestions
      : []) as PropertySuggestion[])
      .filter((property) => !dismissed.has(property.id))
      .map((property) => ({
        id: `property-suggestion:${property.id}`,
        type: "property_phone_suggestion",
        title: "Tòa nhà có thể liên quan đến bạn",
        message: [property.house_number, property.address, property.ward, property.district, property.city].filter(Boolean).join(", "),
        reference_id: property.id,
        reference_type: "property_phone_suggestion",
        is_read: false,
        created_at: new Date().toISOString(),
        metadata: {
          has_owner: property.has_owner === true,
          pending_role: property.pending_role ?? null,
          match_source: property.match_source ?? null,
        },
      }));

    return apiSuccess({
      notifications: [...(notificationsResult.data ?? []), ...suggestionNotifications],
      unread_count: (unreadResult.count ?? 0) + suggestionNotifications.length,
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
    const { data: suggestionData, error: suggestionError } = await supabase.rpc("get_my_phone_property_suggestions_v1");
    if (suggestionError) return mapDatabaseError(suggestionError);
    const suggestions = (Array.isArray(suggestionData?.suggestions) ? suggestionData.suggestions : []) as PropertySuggestion[];
    const [deleteResult, dismissResult] = await Promise.all([
      supabase.from("notifications").delete().eq("user_id", user.id),
      suggestions.length
        ? supabase.from("property_suggestion_dismissals").upsert(
            suggestions.map((property) => ({ user_id: user.id, property_id: property.id })),
            { onConflict: "user_id,property_id" },
          )
        : Promise.resolve({ error: null }),
    ]);
    if (deleteResult.error) return mapDatabaseError(deleteResult.error);
    if (dismissResult.error) return mapDatabaseError(dismissResult.error);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return mapUnknownError(error);
  }
}
