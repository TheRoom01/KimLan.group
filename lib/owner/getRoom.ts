import { createSupabaseServerClient } from "../supabase/server";

export async function getRoom(roomId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("rooms")
    .select(`
      *,
      properties (
        id,
        name
      ),
      rental_contracts (
        *,
        contract_tenants (
          *,
          tenants (
            *
          )
        )
      )
    `)
    .eq("id", roomId)
    .single();

  if (error) throw error;

  return data;
}