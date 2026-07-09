import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ZaloImportsClient from "./ZaloImportsClient";

export default async function ZaloImportsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: u, error: userErr } = await supabase.auth.getUser();
  const user = u?.user;

  if (userErr || !user) redirect("/");

  const { data: levelData, error: levelErr } =
    await supabase.rpc("get_my_admin_level");

  const level = Number(levelData ?? 0);

  if (levelErr || (level !== 1 && level !== 2)) redirect("/");

  return <ZaloImportsClient />;
}