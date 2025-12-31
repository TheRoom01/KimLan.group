import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  // admin level
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;

  let adminLevel: 0 | 1 | 2 = 0;
  if (user?.id) {
    const { data } = await supabase
      .from("admin_users")
      .select("level")
      .eq("user_id", user.id)
      .maybeSingle();

    const lvl = Number((data as any)?.level ?? 0);
    adminLevel = (lvl === 2 ? 2 : lvl === 1 ? 1 : 0) as 0 | 1 | 2;
  }

  // filters
  let districts: string[] = [];
  let roomTypes: string[] = [];
  try {
    const { data } = await supabase.rpc("get_public_filters");
    if (data) {
      districts = (data as any).districts ?? [];
      roomTypes = (data as any).roomTypes ?? [];
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    adminLevel,
    districts,
    roomTypes,
  });
}
