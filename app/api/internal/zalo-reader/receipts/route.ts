import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readerSecretMatches } from "@/lib/zalo-reader/status-service";
import { OFFICIAL_ZALO_GROUPS } from "@/lib/zalo-reader/official";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!readerSecretMatches(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const group = OFFICIAL_ZALO_GROUPS.find(item => item.key === body.groupKey);
    if (!group || !Array.isArray(body.sources) || body.sources.length > 100 || body.sources.some((item: { id?: unknown; pendingIds?: unknown }) => typeof item.id !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(item.id) || (item.pendingIds !== undefined && (!Array.isArray(item.pendingIds) || item.pendingIds.length > 100)))) return NextResponse.json({ ok: false }, { status: 400 });
    const sources = body.sources as Array<{ id: string; pendingIds?: string[] }>;
    if (!sources.length) return NextResponse.json({ replay: [] });
    const db = createSupabaseAdminClient();
    const batches = await db.from("zalo_import_batches").select("id,source_message_id,parser_result").eq("group_name", group.name).in("source_message_id", sources.map(item => item.id));
    if (batches.error) throw batches.error;
    const official = (batches.data || []).filter(batch => !(batch.parser_result as Record<string, unknown> | null)?.test_import && !(batch.parser_result as { official_source?: { trial?: boolean } } | null)?.official_source?.trial);
    const pending = official.length ? await db.from("pending_room_versions").select("id,batch_id,status").in("batch_id", official.map(item => item.id)) : { data: [], error: null };
    if (pending.error) throw pending.error;
    const replay = sources.filter(source => {
      const matching = official.filter(batch => batch.source_message_id === source.id);
      const rows = (pending.data || []).filter(row => matching.some(batch => batch.id === row.batch_id));
      // A missing pending is a deletion. Only a rejected receipt reopens the source.
      const pendingIds = source.pendingIds;
      if (pendingIds?.length) {
        return rows.some(row => row.status === "Từ chối" && pendingIds.includes(row.id));
      }
      // Populate IDs on legacy checkpoints while their source still exists.
      return rows.length > 0;
    }).map(source => source.id);
    return NextResponse.json({ replay });
  } catch { return NextResponse.json({ ok: false, error: "READER_RECEIPTS_UNAVAILABLE" }, { status: 503 }); }
}
