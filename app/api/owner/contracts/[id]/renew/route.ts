import {
  NextResponse
} from "next/server";


import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


import {
  apiSuccess,
  mapDatabaseError
} from "@/lib/api/response";



export async function POST(

req:Request,

{
 params
}:{
 params:Promise<{
  id:string
 }>
}

){


const {
 id
}
=
await params;



const body =
await req.json();



const supabase =
await createSupabaseServerClient();



const {
 data,
 error
}
=
await supabase.rpc(
"renew_owner_contract_v1",
{

p_contract_id:id,

p_start_date:
body.start_date,

p_end_date:
body.end_date,

p_monthly_price:
body.monthly_price

}
);



if(error){

return mapDatabaseError(
  error
);

}



return apiSuccess(
  data
);


}