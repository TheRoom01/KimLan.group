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

    if (
      data &&
      typeof data === "object" &&
      "mode" in data &&
      data.mode === "existing"
    ) {

      return apiSuccess(data, 200);

    }

    const result = data as { room_id?: string; room?: { id?: string } } | null;
    const roomId = result?.room_id ?? result?.room?.id;
    if (roomId) {
      const { error: locationError } = await supabase
        .from("rooms")
        .update(roomLocationPatch(body))
        .eq("id", roomId)
        .eq("property_id", propertyId);
      if (locationError) return mapDatabaseError(locationError);
    }


    return apiSuccess(data,201);
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
