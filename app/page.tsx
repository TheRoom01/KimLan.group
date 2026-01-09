import HomeClient from "./HomeClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRoomsServer } from "@/lib/fetchRoomsServer";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  
  const supabase = await createSupabaseServerClient();
  // 1) Resolve user + admin level on server (so initial render knows role)
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

  // 2) Fetch filter options on server (optional but faster first paint)
  let initialDistricts: string[] = [];
  let initialRoomTypes: string[] = [];
  try {
    const { data } = await supabase.rpc("get_public_filters");
    if (data) {
      initialDistricts = (data as any).districts ?? [];
      initialRoomTypes = (data as any).roomTypes ?? [];
    }
  } catch {
    // ignore
  }

  // 3) Fetch page 0 on server using the same RPC as client
  const LIMIT = 20;
  const res = await fetchRoomsServer(supabase, {
    limit: LIMIT,
    cursor: null,
    adminLevel,
    search: null,
    minPrice: 3_000_000,
    maxPrice: 30_000_000,
    districts: null,
    roomTypes: null,
    move: null,
  });

  return (
    <HomeClient
      initialRooms={res.data}
      initialNextCursor={res.nextCursor}
      initialAdminLevel={adminLevel}
      initialTotal={res.total ?? null}
    />
  );
}