import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawTargetId } = await params;
    const targetId = parseUuid(rawTargetId, "room_id");
    const body = await readJsonObject(request);
    const sourceId = parseUuid(String(body.source_room_id ?? ""), "source_room_id");
    const targetAuth = await authorizeRoomMutation(targetId);
    if (!targetAuth.allowed) return apiError(targetAuth.error, "Bạn không có quyền cập nhật phòng đích", targetAuth.status);
    const sourceAuth = await authorizeRoomMutation(sourceId);
    if (!sourceAuth.allowed) return apiError(sourceAuth.error, "Bạn không có quyền sao chép phòng nguồn", sourceAuth.status);

    const { data: rooms, error: roomsError } = await targetAuth.supabase
      .from("rooms").select("id, property_id").in("id", [sourceId, targetId]);
    if (roomsError) return mapDatabaseError(roomsError);
    const source = rooms?.find((room) => room.id === sourceId);
    const target = rooms?.find((room) => room.id === targetId);
    if (!source || !target) return apiError("NOT_FOUND", "Không tìm thấy phòng nguồn hoặc phòng đích", 404);
    if (source.property_id !== target.property_id) return apiError("INVALID_INPUT", "Chỉ có thể sao chép media trong cùng một tòa nhà", 400);

    const requestedMediaIds = Array.isArray(body.media_ids)
      ? body.media_ids.map((id) => parseUuid(String(id), "media_id"))
      : null;
    let mediaQuery = targetAuth.supabase
      .from("room_media").select("id, type, provider, url, path, is_cover, sort_order")
      .eq("room_id", sourceId).order("sort_order");
    if (requestedMediaIds) {
      if (!requestedMediaIds.length) return apiSuccess([]);
      mediaQuery = mediaQuery.in("id", requestedMediaIds);
    }
    const { data: media, error: mediaError } = await mediaQuery;
    if (mediaError) return mapDatabaseError(mediaError);
    if (!media?.length) return apiSuccess([]);
    const rows = media.map(({ id: _id, ...item }) => ({ ...item, room_id: targetId }));
    const { data, error } = await targetAuth.supabase.from("room_media").insert(rows)
      .select("id, room_id, type, provider, url, path, is_cover, sort_order, created_at");
    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? [], 201);
  } catch (error) { return mapUnknownError(error); }
}
