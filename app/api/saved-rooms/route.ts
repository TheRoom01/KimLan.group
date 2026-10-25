import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachRoomBadges } from "@/lib/roomBadges";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const ids = Array.from(new Set(searchParams
      .get("ids")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [])).slice(0, 50);

    if (!ids || ids.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const supabase = await createSupabaseServerClient();

    const { data: rooms, error: roomsError } = await supabase
      .from("room_full_public")
      .select("*")
      .in("id", ids);

    if (roomsError) {
      return NextResponse.json(
        { data: [], step: "rooms", error: roomsError.message },
        { status: 500 }
      );
    }

    const { data: mediaRows, error: mediaError } = await supabase
      .from("room_media")
      .select("room_id,type,url,created_at")
      .in("room_id", ids)
      .order("created_at", { ascending: true });

    const { data: detailRows, error: detailError } = await supabase
      .from("room_details")
      .select("*")
      .in("room_id", ids);

    const detailsMap = new Map((detailError ? [] : detailRows ?? []).map((detail) => [String(detail.room_id), detail]));

    if (mediaError) {
      return NextResponse.json(
        { data: [], step: "room_media", error: mediaError.message },
        { status: 500 }
      );
    }

    const mediaMap = new Map<string, any[]>();

    for (const m of mediaRows ?? []) {
      if (!m.room_id || !m.url) continue;

      const arr = mediaMap.get(m.room_id) ?? [];
      arr.push(m);
      mediaMap.set(m.room_id, arr);
    }

    const roomMap = new Map<string, any>();

    for (const room of rooms ?? []) {
      const media = mediaMap.get(room.id) ?? [];

      const images = media
        .filter((m) => m.type === "image" && m.url)
        .map((m) => String(m.url));

      const video = media.find((m) => m.type === "video" && m.url);

      roomMap.set(room.id, {
        ...room,
        room_detail: detailsMap.get(String(room.id)) ?? null,
        image_urls: images.slice(0, 3),
        image_count: images.length,
        has_video: Boolean(video),
        video_url: video?.url ?? null,
        thumb_url: images[0] ?? null,
      });
    }

    const finalRooms = ids.map((id) => roomMap.get(id)).filter(Boolean);

    return NextResponse.json({ data: await attachRoomBadges(supabase, finalRooms) });
  } catch (err: any) {
    return NextResponse.json(
      {
        data: [],
        step: "catch",
        error: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
