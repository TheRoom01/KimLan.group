import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getRoomStatusLogs(roomId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("room_status_logs")
    .select("id, old_status, new_status, changed_by, note, changed_at")
    .eq("room_id", roomId)
    .order("changed_at", { ascending: false });

  if (error) throw error;

  const logs = data ?? [];
  const actorIds = Array.from(
    new Set(
      logs
        .map((log) => String(log.changed_by ?? "").trim())
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  );

  if (actorIds.length === 0) return logs;

  const admin = createSupabaseAdminClient();
  const [adminResult, ownerResult] = await Promise.all([
    admin.from("admin_users").select("user_id, full_name").in("user_id", actorIds),
    admin.from("owner_portal_profiles").select("user_id, full_name").in("user_id", actorIds),
  ]);
  const actorNames = new Map<string, { fullName: string; source: "admin" | "owner" }>();

  for (const profile of ownerResult.data ?? []) {
    const fullName = String(profile.full_name ?? "").trim();
    if (profile.user_id && fullName) {
      actorNames.set(profile.user_id, { fullName, source: "owner" });
    }
  }

  // Admin wins if a legacy account happens to have both profile types.
  for (const profile of adminResult.data ?? []) {
    const fullName = String(profile.full_name ?? "").trim();
    if (profile.user_id && fullName) {
      actorNames.set(profile.user_id, { fullName, source: "admin" });
    }
  }

  return logs.map((log) => {
    const actor = actorNames.get(String(log.changed_by ?? ""));
    return {
      ...log,
      changed_by_name: actor?.fullName ?? null,
      changed_by_source: actor?.source ?? null,
    };
  });
}
