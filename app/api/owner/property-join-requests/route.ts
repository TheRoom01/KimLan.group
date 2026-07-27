import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export async function GET() {
  try {
    const supabase =
      await createSupabaseServerClient();


    const user =
      await getAuthenticatedUser(supabase);


    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để xem yêu cầu tham gia tài sản",
        401,
      );
    }



    const {
      data,
      error,
    } = await supabase.rpc(
      "get_owner_property_join_requests_v1",
    );



    if (error) {
      return mapDatabaseError(error);
    }



    return apiSuccess(data);


  } catch (error) {

    return mapUnknownError(error);

  }
}