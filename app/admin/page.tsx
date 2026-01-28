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
 const { data: levelData, error: levelErr } =
  await supabase.rpc("get_my_admin_level");

const level = Number(levelData ?? 0);

if (levelErr || level !== 1) {
  redirect("/");
}

  // 3) SSR initial table page (page=1, search="")
  const from = 0;
  const to = PAGE_SIZE - 1;
  const offset = from;

const { data: rpcData, error: rpcErr } =
  await supabase.rpc("fetch_admin_rooms_l1_v1", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_search: null,
  });

if (rpcErr) {
  console.error("fetch_admin_rooms_l1_v1 error:", rpcErr);
  return <AdminClient initialRooms={[]} initialTotal={0} />;
}

const rooms = ((rpcData as any)?.data ?? []) as any[];
const total = Number((rpcData as any)?.total ?? 0);

return <AdminClient initialRooms={rooms} initialTotal={total} />;

}
