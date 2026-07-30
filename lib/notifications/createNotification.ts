import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CreateNotificationInput = {
  user_id: string;
  type: string;
  title: string;
  message?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
};

export async function createNotification(input: CreateNotificationInput) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      reference_id: input.reference_id ?? null,
      reference_type: input.reference_type ?? null,
    })
    .select("id, user_id, type, title, message, reference_id, reference_type, is_read, created_at")
    .single();

  if (error) throw error;
  return data;
}
