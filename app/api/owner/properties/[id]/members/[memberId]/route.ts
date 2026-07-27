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
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MEMBER_ROLES = new Set(["manager", "viewer"]);

type RouteParams = {
  params: Promise<{
    id: string;
    memberId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id: rawPropertyId, memberId: rawMemberId } = await params;
    const propertyId = parseUuid(rawPropertyId, "property_id");
    const memberId = parseUuid(rawMemberId, "member_id");
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
    const role = String(body.role ?? "").trim().toLowerCase();

    if (!MEMBER_ROLES.has(role)) {
      throw new RequestValidationError(
        "Role thành viên phải là manager hoặc viewer",
        { field: "role" },
      );
    }

    const { data, error } = await supabase.rpc(
      "update_owner_property_member_role_v1",
      {
        p_property_id: propertyId,
        p_member_id: memberId,
        p_role: role,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id: rawPropertyId, memberId: rawMemberId } = await params;
    const propertyId = parseUuid(rawPropertyId, "property_id");
    const memberId = parseUuid(rawMemberId, "member_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data, error } = await supabase.rpc(
      "revoke_owner_property_member_v1",
      {
        p_property_id: propertyId,
        p_member_id: memberId,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
