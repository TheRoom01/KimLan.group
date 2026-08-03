import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { parseUuid, readJsonObject } from "@/lib/api/validation";
import { parseCreateOwnerRoomInput } from "@/lib/owner/validation";


export async function POST(request:Request){

try{

const supabase =
 await createSupabaseServerClient();


const user =
 await getAuthenticatedUser(supabase);


if(!user){

return apiError(
"UNAUTHENTICATED",
"Bạn cần đăng nhập",
401
);

}


const body =
 await readJsonObject(request);



const propertyId = parseUuid(body.property_id, "property_id");
const payload = parseCreateOwnerRoomInput(body);



const {data,error}=await supabase.rpc(
"create_owner_room_full_v3",
{
p_property_id:propertyId,
p_payload:payload
}
);



if(error)
 return mapDatabaseError(error);



return apiSuccess(data,201);


}catch(error){

return mapUnknownError(error);

}

}
