import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();

  // 1) Must be logged in
  const { data: u, error: userErr } = await supabase.auth.getUser();
  const user = u?.user;

  if (userErr || !user) {
    redirect("/");
  }

  // 2) Only level 1 can access /admin
  const { data: admin, error: adminErr } = await supabase
    .from("admin_users")
    .select("level")
    .eq("user_id", user.id)
    .maybeSingle();

  const level = Number((admin as any)?.level ?? 0);
  if (adminErr || level !== 1) {
    redirect("/");
  }

  // 3) SSR initial table page (page=1, search="")
  const from = 0;
  const to = PAGE_SIZE - 1;

  const selectCols = [
    "id",
    "created_at",
    "updated_at",
    "room_code",
    "house_number",
    "address",
    "ward",
    "district",
    "room_type",
    "status",
    "link_zalo",
    "zalo_phone",
    "price",
  ].join(",");

  const { data, count, error } = await supabase
    .from("room_full_admin_l1")
    .select(selectCols, { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    // Keep page accessible; show empty list + total 0 on error.
    return <AdminClient initialRooms={[]} initialTotal={0} />;
  }

  const rooms = ((data ?? []) as any) as any[];
  const total = count ?? 0;

  return <AdminClient initialRooms={rooms as any} initialTotal={total} />;
}
