import {
  NextResponse
} from "next/server";


import {
  createSupabaseServerClient
} from "@/lib/supabase/server";



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



const supabase =
await createSupabaseServerClient();



const {
 data,
 error
}
=
await supabase.rpc(
"end_owner_contract_v1",
{
 p_contract_id:id
}
);



if(error){

return NextResponse.json(

{
 error:error.message
},

{
 status:400
}

);

}



return NextResponse.json(
data
);

}