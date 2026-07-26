import {
  NextResponse
} from "next/server";


import {
  createSupabaseServerClient
} from "@/lib/supabase/server";



export async function PATCH(

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
  } = await params;



  const body =
    await request.json();



  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  } =
  await supabase.rpc(
    "update_owner_room_v1",
    {

      p_room_id:id,

      p_room_type:
        body.room_type,


      p_price:
        body.price,


      p_description:
        body.description,


      p_status:
        body.status

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



  return NextResponse.json({

    success:true,

    data

  });


}