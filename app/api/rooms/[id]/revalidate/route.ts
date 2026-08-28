import { NextResponse } from "next/server";

import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeRoomMutation(id);

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  invalidatePublicRoomCache(id);
  return NextResponse.json({ ok: true });
}
