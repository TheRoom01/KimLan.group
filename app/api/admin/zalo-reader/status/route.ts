import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readReaderStatus } from "@/lib/zalo-reader/status-service";
export const dynamic = "force-dynamic";
export async function GET() {
  const userDb = await createSupabaseServerClient();
  const auth = await userDb.auth.getUser();
  if (auth.error || !auth.data.user) return NextResponse.json({ ok: false }, { status: 401 });
  const level = await userDb.rpc("get_my_admin_level");
  if (level.error || ![1,2].includes(Number(level.data))) return NextResponse.json({ ok: false }, { status: 403 });
  try { return NextResponse.json({ ok: true, groups: await readReaderStatus(createSupabaseAdminClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false, code: "READER_SETUP_REQUIRED" }, { status: 503 }); }
}
