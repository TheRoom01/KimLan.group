"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

const PATH = "/reports/room-history";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function restoreRoomHistory(form: FormData) {
  const eventId = String(form.get("eventId") ?? "");
  const field = String(form.get("field") ?? "");
  if (!UUID.test(eventId) || !["price", "visibility"].includes(field)) redirect(`${PATH}?result=invalid`);

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/?auth=login");
  const { data: level, error: levelError } = await supabase.rpc("get_my_admin_level");
  if (levelError || Number(level) !== 1) redirect("/admin");

  const { data: roomId, error } = await supabase.rpc("restore_room_audit_event_v1", { p_event_id: eventId, p_field: field });
  if (error) {
    const result = error.code === "40001" || error.code === "23505" ? "conflict"
      : error.code === "P0002" ? "missing" : "failed";
    redirect(`${PATH}?result=${result}`);
  }

  invalidatePublicRoomCache(typeof roomId === "string" ? roomId : null);
  revalidatePath("/admin");
  revalidatePath(PATH);
  redirect(`${PATH}?result=restored`);
}
