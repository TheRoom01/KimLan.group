import { NextResponse } from "next/server";

import {
  createSupabaseServerClient
} from "@/lib/supabase/server";



export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {


  try {


    const {
      id
    } = await params;



    if(!id){

      return NextResponse.json(
        {
          error:"PROPERTY_ID_REQUIRED"
        },
        {
          status:400
        }
      );

    }



    const supabase =
      await createSupabaseServerClient();



    const {
      data:{
        user
      }
    } =
    await supabase.auth.getUser();



    if(!user){

      return NextResponse.json(
        {
          error:"UNAUTHENTICATED"
        },
        {
          status:401
        }
      );

    }



    const {
      data,
      error
    }
    =
    await supabase.rpc(
      "get_owner_property_detail_v1",
      {
        p_property_id:id
      }
    );



    if(error){

      console.error(
        "get owner property detail error:",
        error
      );


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
      },
      {
        status:200
      }
    );



  }

  catch(error:any){


    console.error(
      "owner property api error:",
      error
    );


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