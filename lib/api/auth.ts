import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

export async function getAuthenticatedUser(
  supabase: SupabaseClient,
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Owner API auth error:", error);
    return null;
  }

  return user;
}
