import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";

import { getAuthenticatedUser } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {

    const { id } = await params;


    const supabase =
      await createSupabaseServerClient();


    const user =
      await getAuthenticatedUser(
        supabase,
      );


    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }


    const {
      data,
      error,
    } = await supabase.rpc(
      "get_property_access_summary_v1",
      {
        p_property_id: id,
      },
    );


    if (error) {
      return mapDatabaseError(error);
    }


    return apiSuccess(data);


  } catch (error) {

    return mapUnknownError(error);

  }
}