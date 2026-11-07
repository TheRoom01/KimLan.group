import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getAdminRequestContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, user: null, level: null };

  const { data, error } = await supabase.rpc("get_my_admin_level");
  const rawLevel = Number(data ?? 0);
  const level: 1 | 2 | null = !error && (rawLevel === 1 || rawLevel === 2) ? rawLevel : null;
  return { supabase, user, level };
});
