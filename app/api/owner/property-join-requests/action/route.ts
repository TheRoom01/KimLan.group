import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";

import {
  readJsonObject,
} from "@/lib/api/validation";

import {
  getAuthenticatedUser,
} from "@/lib/api/auth";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";



export async function POST(
  request:Request,
){

  try {


    const supabase =
      await createSupabaseServerClient();



    const user =
      await getAuthenticatedUser(
        supabase,
      );



    if(!user){

      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập",
        401,
      );

    }



    const body =
      await readJsonObject(
        request,
      );



    const requestId =
      String(
        body.request_id ?? "",
      );



    const action =
      String(
        body.action ?? "",
      );



    if(
      !requestId ||
      !["approve","reject"]
      .includes(action)
    ){

      return apiError(
        "INVALID_INPUT",
        "Dữ liệu không hợp lệ",
        400,
      );

    }



    const rpc =
      action === "approve"
      ? "approve_property_join_request_v1"
      : "reject_property_join_request_v1";



    const {
      data,
      error,
    } =
      await supabase.rpc(
        rpc,
        {
          p_request_id:
            requestId,
        },
      );



    if(error){

      return mapDatabaseError(error);

    }



    return apiSuccess(data);



  }catch(error){

    return mapUnknownError(error);

  }

}