import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RoomConsultRequestsClient from "@/app/admin/room-inquiries/RoomConsultRequestsClient";

export default async function OwnerRoomInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/");

  const [{ data: levelData, error: levelError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.rpc("get_my_admin_level"),
    supabase
      .from("property_members")
      .select("property_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "manager"])
      .limit(1),
  ]);

  const level = Number(levelData ?? 0);
  const isAdmin = !levelError && (level === 1 || level === 2);
  if (!isAdmin && (membershipError || !memberships?.length)) redirect("/owner");

  const params = await searchParams;
  return (
    <RoomConsultRequestsClient
      backHref="/owner"
      focusRequestId={typeof params.request === "string" ? params.request : undefined}
    />
  );
}
