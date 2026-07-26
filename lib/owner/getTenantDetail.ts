import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getTenantDetail(
  tenantId:string
){

  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  }
  =
  await supabase
    .from("contract_tenants")
    .select(`

      id,

      tenants!inner (

        id,

        full_name,

        phone,

        cccd,

        date_of_birth,

        gender,

        address,

        note

      ),


      rental_contracts!inner (

        id,

        start_date,

        end_date,

        monthly_price,

        deposit_amount,

        status,


        rooms!inner (

          id,

          room_code,


          properties!rooms_property_id_fkey (

            id,

            name,

            address

          )

        )

      )

    `)
    .eq(
      "tenant_id",
      tenantId
    )
    .eq(
      "role",
      "Chủ hợp đồng"
    )
    .maybeSingle();



  if(error){

    throw error;

  }



  if(!data){

    return null;

  }



  const tenant =
    Array.isArray(data.tenants)
      ? data.tenants[0]
      : data.tenants;



  const contract =
    Array.isArray(data.rental_contracts)
      ? data.rental_contracts[0]
      : data.rental_contracts;



  const room =
    Array.isArray(contract?.rooms)
      ? contract.rooms[0]
      : contract?.rooms;



  const property =
    Array.isArray(room?.properties)
      ? room.properties[0]
      : room?.properties;



  return {

    id:data.id,


    tenant,


    contract,


    room,


    property

  };

}