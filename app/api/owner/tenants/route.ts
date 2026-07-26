import {
  NextResponse
} from "next/server";


import {
  createSupabaseServerClient
} from "@/lib/supabase/server";



export async function GET(){


  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  } =
  await supabase
    .from("rental_contracts")
    .select(`

      id,

      status,

      start_date,

      end_date,

      monthly_price,


      rooms (

        id,

        room_code,

        property_id,


        properties!rooms_property_id_fkey (

            id,

            name

        )

        ),



      contract_tenants (

        role,


        tenants (

          id,

          full_name,

          phone,

          cccd

        )

      )

    `)
    .eq(
      "status",
      "Đang hiệu lực"
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

    data ?? []

  );


}