import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export async function GET() {

  try {

   const supabase =
  await createSupabaseServerClient();


    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();


    if (!user) {

      return NextResponse.json(
        {
          error: "UNAUTHENTICATED"
        },
        {
          status:401
        }
      );

    }


    const {
      data,
      error
    } = await supabase.rpc(
      "get_owner_dashboard_v1",
      {
        p_attention_limit:10,
        p_activity_limit:10
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
      {
        ok:true,
        data
      }
    );


  }

  catch(error:any){

    return NextResponse.json(
      {
        error:error.message
      },
      {
        status:500
      }
    );

  }

}