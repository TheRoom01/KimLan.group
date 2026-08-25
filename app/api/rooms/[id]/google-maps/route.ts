import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveGoogleMapsUrl } from "@/lib/roomActionLinks";

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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return json({ error: "INVALID_ROOM_ID" }, 400);

    const visitorClient = await createSupabaseServerClient();
    const { data, error } = await visitorClient.rpc(
      "resolve_room_google_maps_source_v1",
      { p_id: id },
    );
    if (error) throw error;
    if (!data) return json({ error: "ROOM_NOT_FOUND" }, 404);

    const source = data as {
      latitude?: number | null;
      longitude?: number | null;
      google_maps_url?: string | null;
      house_number?: string | null;
      address?: string | null;
      ward?: string | null;
      district?: string | null;
      city?: string | null;
    };

    const address = [
      [source.house_number, source.address].filter(Boolean).join(" "),
      source.ward,
      source.district,
      source.city,
      "Việt Nam",
    ]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(", ");

    const googleMapsUrl =
      resolveGoogleMapsUrl({
        latitude: source.latitude,
        longitude: source.longitude,
        googleMapsUrl: source.google_maps_url,
        address,
      }) || null;

    if (
      googleMapsUrl &&
      new URL(request.url).searchParams.get("redirect") === "1"
    ) {
      return NextResponse.redirect(googleMapsUrl, {
        status: 307,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return json({ googleMapsUrl });
  } catch (error) {
    console.error("GET /api/rooms/[id]/google-maps failed:", error);
    return json({ error: "GOOGLE_MAPS_UNAVAILABLE" }, 500);
  }
}
