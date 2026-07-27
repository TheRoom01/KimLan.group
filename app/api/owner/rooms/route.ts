import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { readJsonObject } from "@/lib/api/validation";


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



const {
property_id,
...payload
}=body;



const {data,error}=await supabase.rpc(
"create_owner_room_v2",
{
p_property_id:property_id,
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