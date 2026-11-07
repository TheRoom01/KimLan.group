import { redirect } from "next/navigation";
import AdminClient from "./AdminClient";
import { getAdminRequestContext } from "./request-context";
import { attachRoomBadges } from "@/lib/roomBadges";

const PAGE_SIZE = 20;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    report?: string;
  }>;
}) {

  const { supabase, level } = await getAdminRequestContext();
  if (!level) redirect("/");
  const params = await searchParams;

  const report =
    typeof params?.report === "string"
      ? params.report
      : null;

  // SSR initial table page (page=1, search="")
  const offset = 0;

  const rpcName =
  level === 2 ? "fetch_admin_rooms_l2_v2" : "fetch_admin_rooms_l1_v2";

  const { data: rpcData, error: rpcErr } =
    await supabase.rpc(rpcName as any, {
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_search: null,
      p_report: report ?? null,
    });

  if (rpcErr) {
    console.error(`${rpcName} error:`, rpcErr);
    return <AdminClient key={report ?? ""} initialRooms={[]} initialTotal={0} adminLevel={level} report={report} initialLoadFailed />;
  }

  const rooms = await attachRoomBadges(supabase, ((rpcData as any)?.data ?? []) as any[]);
  const total = Number((rpcData as any)?.total_count ?? (rpcData as any)?.total ?? 0);
  return (
    <AdminClient key={report ?? ""} initialRooms={rooms} initialTotal={total} adminLevel={level} report={report} />
  );
}
