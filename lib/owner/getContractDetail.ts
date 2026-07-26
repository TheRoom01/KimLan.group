import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getContractDetail(
  contractId:string
){

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

      start_date,

      end_date,

      monthly_price,

      deposit_amount,

      status,

      note,


      rooms (

        id,

        room_code,

        properties!rooms_property_id_fkey (

            id,

            code,

            name,

            property_key,

            house_number,

            address,

            district,

            ward,

            city

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
      "id",
      contractId
    )
    .single();



  if(error){

    console.error(
        "getContractDetail error:",
        error
    );

    throw new Error(
        error.message
    );

    }



  const tenantRelation =
    data.contract_tenants?.find(
      (x:any)=>
        x.role==="Chủ hợp đồng"
    )
    ??
    data.contract_tenants?.[0];



  const tenant =
    Array.isArray(
      tenantRelation?.tenants
    )
    ?
    tenantRelation.tenants[0]
    :
    tenantRelation?.tenants;



  const room =
    Array.isArray(data.rooms)
    ?
    data.rooms[0]
    :
    data.rooms;



  const property =
    Array.isArray(
      room?.properties
    )
    ?
    room.properties[0]
    :
    room?.properties;



  return {

    ...data,

    tenant,

    room,

    property

  };


}