import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

import {
  getAuthenticatedUser,
} from "@/lib/api/auth";


export async function GET(
 request:Request,
 {
  params,
 }:{
  params:{
    id:string;
 }
}
){


try{


const supabase =
 await createSupabaseServerClient();



const user =
 await getAuthenticatedUser(
  supabase,
 );


if(!user){

 return apiError(
  "UNAUTHENTICATED",
  "Unauthorized",
  401
 );

}



const {
 data,
 error
}
=
await supabase.rpc(
 "get_property_access_summary_v1",
 {
  p_property_id:
   params.id
 }
);



if(error){

 return mapDatabaseError(error);

}



return apiSuccess(data);



}catch(error){

return mapUnknownError(error);

}


}