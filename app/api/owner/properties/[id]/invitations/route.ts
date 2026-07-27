import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseInvitePropertyManagerInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getRequestContext(rawPropertyId: string) {
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
    const { propertyId, supabase, user } = await getRequestContext(id);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const { data, error } = await supabase.rpc(
      "get_owner_property_invitations_v1",
      { p_property_id: propertyId },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? []);
  } catch (error) {
    return mapUnknownError(error);
  }
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
    const { id } = await params;
    const { propertyId, supabase, user } = await getRequestContext(id);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const body = await readJsonObject(request);
    const input = parseInvitePropertyManagerInput(body);

    const { data, error } = await supabase.rpc(
      "invite_owner_property_manager_v1",
      {
        p_property_id: propertyId,
        p_email: input.email,
        p_phone: input.phone,
        p_invitee_name: input.invitee_name,
        p_expires_in_days: input.expires_in_days,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
