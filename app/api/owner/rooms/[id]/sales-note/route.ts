import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseOptionalString, parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const roomId = parseUuid(id, "room_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data: room, error: roomError } = await supabase.from("rooms").select("id,property_id").eq("id", roomId).maybeSingle();
    if (roomError) return mapDatabaseError(roomError);
    if (!room?.property_id) return apiError("NOT_FOUND", "Không tìm thấy phòng", 404);
    const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_property", { p_property_id: room.property_id });
    if (permissionError) return mapDatabaseError(permissionError);
    if (canManage !== true) return apiError("FORBIDDEN", "Bạn không có quyền sửa ghi chú Sale", 403);
    const body = await readJsonObject(request);
    const note = parseOptionalString(body.note, "Ghi chú Sale", 5000);
    if (!note) {
      const { error } = await supabase.from("sales_room_notes").delete().eq("room_id", roomId);
      if (error) return mapDatabaseError(error);
      return apiSuccess({ room_id: roomId, note: null });
    }
    const { data, error } = await supabase.from("sales_room_notes").upsert({ room_id: roomId, property_id: room.property_id, note, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "room_id" }).select("room_id,note,updated_at").single();
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}
