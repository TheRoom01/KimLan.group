import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRIVATE_NO_STORE_HEADERS, requirePublicRoomDataAccess } from "@/lib/rooms/anonymousHomeAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requirePublicRoomDataAccess();
  if (!access.allowed) {
    return NextResponse.json(
      { adminLevel: 0, districts: [], roomTypes: [], error: "ANON_SESSION_EXPIRED" },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  const supabase = access.authenticated ? access.viewer : createSupabaseAdminClient();

  // admin level
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user ?? null;

  let adminLevel: 0 | 1 | 2 = 0;
  if (user?.id) {
    const { data } = await supabase
      .rpc("get_my_admin_level")
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

  return NextResponse.json(
    { adminLevel, districts, roomTypes },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}
