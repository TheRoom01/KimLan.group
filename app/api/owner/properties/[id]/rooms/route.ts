import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseCreateOwnerRoomInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const propertyId = parseUuid(rawId, "property_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data: canManage, error: accessError } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
    if (accessError || canManage !== true) return apiError("FORBIDDEN", "Bạn không có quyền quản lý tòa nhà này", 403);
    const { data, error } = await supabase.from("rooms").select("id, room_code, room_type, price").eq("property_id", propertyId).neq("lifecycle_status", "archived").order("room_code");
    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? []);
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const propertyId = parseUuid(rawId, "property_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const body = await readJsonObject(request);
    const payload = parseCreateOwnerRoomInput(body);

    const { data, error } = await supabase.rpc(
      "create_owner_room_v2",
      {
        p_property_id: propertyId,
        p_payload: payload,
      },
    );

    if (error) return mapDatabaseError(error);
    const result = data as { room_id?: string; room?: { id?: string } } | null;
    const roomId = result?.room_id ?? result?.room?.id;
    if (roomId) {
      if (data && typeof data === "object" && "mode" in data && data.mode === "existing") {
        const { error: updateError } = await supabase.rpc("update_owner_room_full_v1", {
          p_room_id: roomId,
          p_payload: { ...payload, publish_status: "draft" },
        });
        if (updateError) return mapDatabaseError(updateError);

        const { error: locationError } = await supabase
          .from("rooms")
          .update({
            house_number: payload.house_number,
            address: payload.address,
            ward: payload.ward,
            district: payload.district,
          })
          .eq("id", roomId);
        if (locationError) return mapDatabaseError(locationError);
      }

      const { error: syncError } = await supabase.rpc(
        "sync_room_shared_property_fields_v1",
        {
          p_room_id: roomId,
          p_link_zalo: payload.link_zalo,
          p_google_maps_url: payload.google_maps_url,
          p_chinh_sach: payload.chinh_sach,
          p_prefer_property_when_empty: true,
        },
      );
      if (syncError) return mapDatabaseError(syncError);
    }

    if (
      data &&
      typeof data === "object" &&
      "mode" in data &&
      data.mode === "existing"
    ) {

      return apiSuccess(data, 200);

    }

    return apiSuccess(data,201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
