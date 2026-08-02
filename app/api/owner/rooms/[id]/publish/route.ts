import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseUpdateOwnerRoomStatusInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const roomId = parseUuid(id, "room_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xuất bản phòng", 401);

    const body = await readJsonObject(request);
    const input = parseUpdateOwnerRoomStatusInput(body);
    const { data, error } = await supabase.rpc("finalize_owner_room_creation_v1", {
      p_room_id: roomId,
      p_status: input.status,
    });
    if (error) {
      const hiddenGuardBlocked = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" ")
        .includes("HIDDEN_ROOM_CONFIRMATION_REQUIRED");

      if (!hiddenGuardBlocked) return mapDatabaseError(error);

      // Admin L1 accounts can also use Owner Portal. The hidden-room guard is
      // correct for manual admin edits, but a newly-created owner room is
      // intentionally finalized by this endpoint after an explicit permission
      // check. Use the server-only client only for this narrowly scoped fallback.
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, property_id")
        .eq("id", roomId)
        .maybeSingle();
      if (roomError || !room?.property_id) return mapDatabaseError(roomError ?? error);

      const { data: canManage, error: permissionError } = await supabase.rpc(
        "can_manage_property",
        { p_property_id: room.property_id },
      );
      if (permissionError || canManage !== true) {
        return apiError("FORBIDDEN", "Bạn không có quyền xuất bản phòng này", 403);
      }

      const admin = createSupabaseAdminClient();
      const { data: property, error: propertyError } = await admin
        .from("properties")
        .select("approval_status, lifecycle_status")
        .eq("id", room.property_id)
        .single();
      if (propertyError) return mapDatabaseError(propertyError);

      const publishStatus =
        property.approval_status === "approved" && property.lifecycle_status === "active"
          ? "published"
          : "draft";
      const { data: finalizedRoom, error: finalizeError } = await admin
        .from("rooms")
        .update({
          status: input.status,
          lifecycle_status: "active",
          publish_status: publishStatus,
          ...(publishStatus === "published" ? { is_hidden: false } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomId)
        .eq("property_id", room.property_id)
        .select("*")
        .single();
      if (finalizeError) return mapDatabaseError(finalizeError);
      return apiSuccess({ ok: true, room: finalizedRoom, published: publishStatus === "published" });
    }
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
