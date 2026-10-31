import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readerSecretMatches, cleanStatusEvent } from "@/lib/zalo-reader/status-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!readerSecretMatches(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const result = await createSupabaseAdminClient().rpc("zalo_reader_readiness_v1");
    return NextResponse.json({ ready: !result.error && result.data === true });
  } catch { return NextResponse.json({ ready: false }, { status: 503 }); }
}
export async function POST(req: Request) {
  if (!readerSecretMatches(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json(); const db = createSupabaseAdminClient();
    if (body.control === "cycle-finished") {
      const next = Date.parse(body.nextExpectedAt || "");
      if(!Number.isFinite(next) || next < Date.now() || next > Date.now()+65*60000) return NextResponse.json({ok:false},{status:400});
      const result = await db.from("zalo_reader_groups").update({next_expected_at:new Date(next).toISOString()}).eq("scheduler_enabled",true);
      if(result.error) throw result.error;
    } else if (["enabled","disabled"].includes(body.control)) {
      const result = await db.from("zalo_reader_groups").update({ scheduler_enabled: body.control === "enabled", next_expected_at: null }).in("group_key", ["Gio-Hang-Can-Ho-Q1-Q3-Q10","Gio-Hang-Can-Ho-PN-BT-TB"]);
      if (result.error) throw result.error;
    } else {
      const row = cleanStatusEvent(body);
      // Bind identity once and ignore late running heartbeats after completion.
      const result = await db.rpc("report_zalo_reader_status_v1", { p_event: row });
      if (result.error) throw result.error;
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false, code: "READER_STATUS_UNAVAILABLE" }, { status: 503 }); }
}
