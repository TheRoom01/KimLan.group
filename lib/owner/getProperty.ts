import { createSupabaseServerClient } from "../supabase/server";

export async function getProperty(id: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;

  return data;
}