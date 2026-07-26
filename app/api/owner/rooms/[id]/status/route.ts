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


  try {


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
      "update_owner_room_status_v1",
      {

        p_room_id:id,

        p_new_status:
          body.status,

        p_note:
          body.note ?? null

      }
    );



    if(error){

      throw error;

    }



    return NextResponse.json({

      success:true,

      data

    });



  }

  catch(error:any){


    return NextResponse.json(

      {
        error:error.message
      },

      {
        status:400
      }

    );

  }

}