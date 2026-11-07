import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { customerFilterDetails, customerSearchDetails } from "@/lib/analytics/activity";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set(["keyword_search", "filter_use", "room_view"]);

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }
  try {
    const raw = await request.text();
    if (raw.length > 2048) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(raw);
    // An older client can still be open when the tracking code is deployed.
    if (body?.action === "page_view" || body?.action === "admin_click") return new NextResponse(null, { status: 204 });
    if (typeof body?.id !== "string" || !uuid.test(body.id) || typeof body.visitorId !== "string" || !uuid.test(body.visitorId)
      || !actions.has(body.action) || (body.action === "room_view" && (typeof body.roomId !== "string" || !uuid.test(body.roomId)))) {
      return new NextResponse(null, { status: 400 });
    }
    const details = body.action === "keyword_search"
      ? customerSearchDetails(body.details?.keyword) ?? {}
      : body.action === "filter_use" ? customerFilterDetails(body.details) : null;
    if (body.action === "filter_use" && body.details != null && !Object.keys(details ?? {}).length) {
      return new NextResponse(null, { status: 204 });
    }
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") return new NextResponse(null, { status: 503 });
    if (user) {
      const { data: level, error } = await supabase.rpc("get_my_admin_level");
      if (error) return new NextResponse(null, { status: 503 });
      if (Number(level) > 0) return new NextResponse(null, { status: 204 });
    }
    const admin = createSupabaseAdminClient();
    let room: { room_code: string | null; district: string | null; ward: string | null } | null = null;
    if (body.action === "room_view") {
      const result = await admin.from("rooms").select("room_code,district,ward,is_hidden").eq("id", body.roomId).maybeSingle();
      if (result.error) return new NextResponse(null, { status: 503 });
      if (!result.data || result.data.is_hidden) return new NextResponse(null, { status: 204 });
      room = result.data;
    }
    const { error } = await admin.rpc("record_visitor_event_v2", {
      p_id: body.id, p_visitor: body.visitorId, p_action: body.action,
      p_room: room ? body.roomId : null, p_code: room?.room_code ?? null,
      p_district: room?.district?.trim() || null, p_ward: room?.ward?.trim() || null,
      p_details: details && Object.keys(details).length ? details : null,
    });
    return new NextResponse(null, { status: error ? 503 : 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
