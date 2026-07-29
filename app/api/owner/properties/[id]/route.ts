import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseCreateOwnerPropertyInput } from "@/lib/owner/validation";
import { generatePropertyCode } from "@/lib/owner/propertyCode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getContext(rawPropertyId: string) {
  const propertyId = parseUuid(rawPropertyId, "property_id");
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);

  return {
    propertyId,
    supabase,
    user,
  };
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await params;
    const { propertyId, supabase, user } = await getContext(id);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data, error } = await supabase.rpc(
      "get_owner_property_detail_v1",
      { p_property_id: propertyId },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await params;
    const { propertyId, supabase, user } = await getContext(id);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data: canManage, error: permissionError } = await supabase.rpc(
      "can_manage_property",
      { p_property_id: propertyId },
    );

    if (permissionError) return mapDatabaseError(permissionError);
    if (canManage !== true) {
      return apiError(
        "FORBIDDEN",
        "Bạn không có quyền cập nhật tòa nhà này",
        403,
      );
    }

    const body = await readJsonObject(request);
    const input = parseCreateOwnerPropertyInput(body);

    const { data, error } = await supabase
      .from("properties")
      .update({
        code: generatePropertyCode({
          houseNumber: input.house_number,
          address: input.address,
          district: input.district,
        }),
        house_number: input.house_number,
        address: input.address,
        ward: input.ward,
        district: input.district,
        city: input.city,
        cover_image: input.cover_image,
        gallery_images: input.gallery_images,
        google_maps_url: input.google_maps_url,
        default_room_data: input.default_room_data,
        note: input.note,
      })
      .eq("id", propertyId)
      .select(
        "id, code, name, house_number, address, ward, district, city, latitude, longitude, cover_image, gallery_images, google_maps_url, default_room_data, note, approval_status, lifecycle_status, updated_at",
      )
      .single();

    if (error) return mapDatabaseError(error);
    const { error: mediaError } = await supabase.rpc("sync_owner_property_media_v1", {
      p_property_id: propertyId,
      p_media: input.gallery_images,
    });
    if (mediaError) return mapDatabaseError(mediaError);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { propertyId, supabase, user } = await getContext(id);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập để xóa tòa nhà", 401);

    const { data: canArchive, error: permissionError } = await supabase.rpc("can_archive_property", { p_property_id: propertyId });
    if (permissionError) return mapDatabaseError(permissionError);
    if (canArchive !== true) return apiError("FORBIDDEN", "Chỉ chủ sở hữu được xóa tòa nhà", 403);

    const { data, error } = await supabase
      .from("properties")
      .update({ lifecycle_status: "archived", archived_at: new Date().toISOString(), archived_by: user.id })
      .eq("id", propertyId)
      .select("id, lifecycle_status, archived_at")
      .single();
    if (error) return mapDatabaseError(error);

    const { error: roomsError } = await supabase
      .from("rooms")
      .update({ lifecycle_status: "archived", publish_status: "hidden", is_hidden: true })
      .eq("property_id", propertyId)
      .eq("lifecycle_status", "active");
    if (roomsError) return mapDatabaseError(roomsError);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
