import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[Supabase] Missing env:", {
    url: supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
  });

  throw new Error(
    "Supabase env is missing. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);
