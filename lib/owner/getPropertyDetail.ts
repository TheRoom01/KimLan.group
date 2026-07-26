import {
  createSupabaseServerClient
} from "../supabase/server";


export async function getPropertyDetail(
  propertyId:string
) {

  const supabase =
    await createSupabaseServerClient();


  const {
    data,
    error
  } =
  await supabase.rpc(
    "get_owner_property_detail_v1",
    {
      p_property_id: propertyId
    }
  );


  if(error){

    console.error(
      "getPropertyDetail error:",
      error
    );


    throw error;

  }


  return {

    property:
      data?.property ?? null,


    summary:
      data?.summary ?? {


        total_rooms:0,

        empty_rooms:0,

        rented_rooms:0,

        upcoming_rooms:0

      },


    rooms:
      data?.rooms ?? [],


    contracts:
      data?.contracts ?? [],


    tenants:
      data?.tenants ?? [],


    members:
      data?.members ?? []

  };

}