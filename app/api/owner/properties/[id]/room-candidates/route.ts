import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function context(rawPropertyId: string) {
  const propertyId = parseUuid(rawPropertyId, "property_id");
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  return { propertyId, supabase, user };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { propertyId, supabase, user } = await context(id);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data, error } = await supabase.rpc("get_owner_property_room_candidates_v1", { p_property_id: propertyId });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { propertyId, supabase, user } = await context(id);
    if (!user) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const body = await readJsonObject(request);
    const roomId = parseUuid(String(body.room_id ?? ""), "room_id");
    const { data, error } = await supabase.rpc("assign_owner_property_room_candidate_v1", {
      p_property_id: propertyId, p_room_id: roomId,
    });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) { return mapUnknownError(error); }
}
