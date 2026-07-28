import {
  createSupabaseServerClient
} from "../supabase/server";
import { getOwnerRooms } from "@/lib/owner/getOwnerRooms";


export async function getPropertyDetail(
  propertyId:string
) {

  const supabase =
    await createSupabaseServerClient();


  const [
    {
      data,
      error,
    },
    ownerRooms,
  ] = await Promise.all([
    supabase.rpc(
      "get_owner_property_detail_v1",
      {
        p_property_id: propertyId,
      },
    ),
    getOwnerRooms(),
  ]);


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
      ownerRooms.filter(
        (room) =>
          String(room.property?.id ?? room.property_id ?? "") === propertyId,
      ),


    contracts:
      data?.contracts ?? [],


    tenants:
      data?.tenants ?? [],


    members:
      data?.members ?? []

  };

}
