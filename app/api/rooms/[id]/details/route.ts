import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;

  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomId } = await params;
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }

    const supabaseAdmin = getAdminClient();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Missing Supabase server environment" },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body || Array.isArray(body)) {
      return NextResponse.json(
        { error: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const payload = {
      ...body,
      room_id: roomId,
    };

    const { data: existing, error: readError } = await supabaseAdmin
      .from("room_details")
      .select("room_id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json(
        { error: readError.message },
        { status: 500 },
      );
    }

    const mutation = existing
      ? supabaseAdmin
          .from("room_details")
          .update(payload)
          .eq("room_id", roomId)
      : supabaseAdmin.from("room_details").insert(payload);

    const { error } = await mutation;

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    invalidatePublicRoomCache(roomId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save room details error:", error);

    return NextResponse.json(
      { error: "Save room details failed" },
      { status: 500 },
    );
  }
}
