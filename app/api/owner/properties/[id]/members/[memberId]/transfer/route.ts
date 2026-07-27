import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      memberId: string;
    }>;
  },
) {
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
      "transfer_owner_property_ownership_v1",
      {
        p_property_id: propertyId,
        p_new_owner_member_id: memberId,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
