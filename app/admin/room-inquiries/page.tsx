import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RoomConsultRequestsClient from "./RoomConsultRequestsClient";

export default async function AdminRoomInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/");
  const { data: levelData, error: levelError } = await supabase.rpc("get_my_admin_level");
  const level = Number(levelData ?? 0);
  if (levelError || (level !== 1 && level !== 2)) redirect("/");
  const params = await searchParams;
  return <RoomConsultRequestsClient backHref="/admin" focusRequestId={params.request} />;
}
