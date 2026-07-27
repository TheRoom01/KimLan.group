import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export async function POST(request: Request) {
  try {

    const supabase =
      await createSupabaseServerClient();


    const user =
      await getAuthenticatedUser(supabase);


    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }


    const body =
      await readJsonObject(request);



    const {
      house_number,
      address,
      ward,
      district,
      city,
      note,

    } = body;



    const { data, error } =
      await supabase.rpc(
        "create_property_v2",
        {
          p_house_number:
            String(house_number ?? ""),

          p_address:
            String(address ?? ""),

          p_ward:
            String(ward ?? ""),

          p_district:
            String(district ?? ""),

          p_city:
            city
              ? String(city)
              : "Hồ Chí Minh",

          p_note:
            note
              ? String(note)
              : null,
        },
      );



    if (error) {
      return mapDatabaseError(error);
    }


    return apiSuccess(
      data,
      201,
    );


  } catch(error){

    return mapUnknownError(error);

  }
}