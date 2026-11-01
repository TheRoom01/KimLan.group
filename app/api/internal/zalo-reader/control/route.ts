import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readerSecretMatches } from "@/lib/zalo-reader/status-service";
import { readReaderControl, reportReaderControl } from "@/lib/zalo-reader/control-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!readerSecretMatches(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try { return NextResponse.json({ ok: true, control: await readReaderControl(createSupabaseAdminClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
export async function POST(req: Request) {
  if (!readerSecretMatches(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try { await reportReaderControl(createSupabaseAdminClient(), await req.json()); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }
}
