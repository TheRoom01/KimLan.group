import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readReaderControl, requestReaderControl, requestOpenZalo } from "@/lib/zalo-reader/control-service";
import { canAccessZaloImports } from "@/lib/zalo-import/access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin() {
  const db = await createSupabaseServerClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user || !canAccessZaloImports(auth.data.user)) return null;
  const level = await db.rpc("get_my_admin_level");
  return !level.error && [1, 2].includes(Number(level.data)) ? auth.data.user : null;
}
export async function GET() {
  if (!await admin()) return NextResponse.json({ ok: false }, { status: 403 });
  try { return NextResponse.json({ ok: true, control: await readReaderControl(createSupabaseAdminClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false, error: "Chưa thiết lập kết nối điều khiển với máy Reader." }, { status: 503 }); }
}
export async function POST(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ ok: false }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || (body.action !== "open_zalo" && typeof body.enabled !== "boolean") || (body.action != null && body.action !== "open_zalo") || (body.action === "open_zalo" && body.enabled != null)) return NextResponse.json({ ok: false }, { status: 400 });
  try { return NextResponse.json({ ok: true, control: body.action === "open_zalo" ? await requestOpenZalo(createSupabaseAdminClient(), user.id) : await requestReaderControl(createSupabaseAdminClient(), body.enabled, user.id) }); }
  catch { return NextResponse.json({ ok: false, error: "Không gửi được lệnh Reader. Kiểm tra cấu hình điều khiển." }, { status: 503 }); }
}
