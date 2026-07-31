import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseUuid,
  readJsonObject,
  RequestValidationError,
} from "@/lib/api/validation";
import { parseCreateOwnerRoomInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PUBLISH_STATUSES = new Set(["draft", "published", "hidden"]);

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const roomId = parseUuid(rawId, "room_id");
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
    const input = parseCreateOwnerRoomInput(body);
    const publishStatus = String(body.publish_status ?? "draft").trim();

    if (!PUBLISH_STATUSES.has(publishStatus)) {
      throw new RequestValidationError("Trạng thái xuất bản không hợp lệ", {
        field: "publish_status",
      });
    }

    const { data, error } = await supabase.rpc(
      "update_owner_room_full_v1",
      {
        p_room_id: roomId,
        p_payload: {
          ...input,
          publish_status: publishStatus,
        },
      },
    );

    if (error) return mapDatabaseError(error);
    const { error: syncError } = await supabase.rpc(
      "sync_room_shared_property_fields_v1",
      {
        p_room_id: roomId,
        p_link_zalo: input.link_zalo,
        p_google_maps_url: input.google_maps_url,
        p_chinh_sach: input.chinh_sach,
        p_prefer_property_when_empty: false,
      },
    );
    if (syncError) return mapDatabaseError(syncError);
    const { error: locationError } = await supabase
      .from("rooms")
      .update(roomLocationPatch(body))
      .eq("id", roomId);
    if (locationError) return mapDatabaseError(locationError);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

function roomLocationPatch(body: Record<string, unknown>) {
  const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;
  return {
    house_number: text(body.house_number, 100),
    address: text(body.address, 500),
    ward: text(body.ward, 120),
    district: text(body.district, 120),
  };
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const roomId = parseUuid(rawId, "room_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data, error } = await supabase.rpc("archive_owner_room_v1", {
      p_room_id: roomId,
    });

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
