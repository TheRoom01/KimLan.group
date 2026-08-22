import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildGoogleMapsSearchUrl,
  normalizeGoogleMapsUrl,
} from "@/lib/roomActionLinks";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return json({ error: "INVALID_ROOM_ID" }, 400);

    // Reuse the room-detail RPC as the visibility gate. If the current visitor
    // cannot view this room, the service-role lookup below is never reached.
    const visitorClient = await createSupabaseServerClient();
    const { data: visibleRoom, error: visibilityError } =
      await visitorClient.rpc("fetch_room_detail_full_v1", {
        p_id: id,
        p_role: 0,
      });

    const visibleRoomId = String(
      (visibleRoom as Record<string, unknown> | null)?.id ?? "",
    );
    if (visibilityError || visibleRoomId !== id) {
      return json({ error: "ROOM_NOT_FOUND" }, 404);
    }

    const admin = createSupabaseAdminClient();
    const { data: room, error } = await admin
      .from("rooms")
      .select(
        "google_maps_url,is_hidden,house_number,address,ward,district,city",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!room || room.is_hidden) return json({ error: "ROOM_NOT_FOUND" }, 404);

    const address = [
      [room.house_number, room.address].filter(Boolean).join(" "),
      room.ward,
      room.district,
      room.city,
      "Việt Nam",
    ]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(", ");

    return json({
      googleMapsUrl:
        normalizeGoogleMapsUrl(room.google_maps_url) ||
        buildGoogleMapsSearchUrl(address) ||
        null,
    });
  } catch (error) {
    console.error("GET /api/rooms/[id]/google-maps failed:", error);
    return json({ error: "GOOGLE_MAPS_UNAVAILABLE" }, 500);
  }
}
