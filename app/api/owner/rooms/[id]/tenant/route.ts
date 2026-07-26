import {
 NextResponse
} from "next/server";


import {
 createSupabaseServerClient
} from "@/lib/supabase/server";



export async function POST(

request:Request,

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
}=await params;



const body =
await request.json();



const supabase =
await createSupabaseServerClient();



const {
  data,
  error
}
=
await supabase.rpc(

  "create_owner_contract_v1",

  {

    p_room_id: id,

    p_full_name:
      body.full_name,

    p_phone:
      body.phone,

    p_cccd:
      body.cccd,

    p_start_date:
      body.start_date,

    p_end_date:
      body.end_date,

    p_monthly_price:
      body.monthly_price,

    p_deposit_amount:
      body.deposit_amount

  }

);



if(error){

  console.error(
    "create_owner_contract_v1 error:",
    error
  );


  return NextResponse.json(

    {
      error:error.message,
      detail:error
    },

    {
      status:400
    }

  );

}



return NextResponse.json({

success:true,

data

});


}