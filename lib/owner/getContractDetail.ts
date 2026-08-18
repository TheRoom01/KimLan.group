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

      contract_type,

      booking_status,

      booking_total_amount,

      note,


      rooms (

        id,

        room_code,

        room_details (

          electric_fee_value,

          water_fee_value,

          service_fee_value,

          parking_fee_value,

          other_fee_value

        ),

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

          cccd,

          cccd_front_path,

          cccd_back_path

        )

      )

    `)
    .eq(
      "id",
      contractId
    )
    .is("deleted_at", null)
    .maybeSingle();



  if(error){

    throw new Error(
        error.message
    );

    }

  if (!data) return null;



  const tenants = (data.contract_tenants ?? [])
    .map((relation) => {
      const tenant = Array.isArray(relation.tenants)
        ? relation.tenants[0]
        : relation.tenants;

      return tenant
        ? {
            ...tenant,
            role: relation.role ?? null,
            cccd_front_url: tenant.cccd_front_path
              ? `/api/owner/tenants/${tenant.id}/identity-image?side=front`
              : null,
            cccd_back_url: tenant.cccd_back_path
              ? `/api/owner/tenants/${tenant.id}/identity-image?side=back`
              : null,
            cccd_front_path: undefined,
            cccd_back_path: undefined,
          }
        : null;
    })
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    );

  const tenant =
    tenants.find((candidate) => candidate?.role === "Chủ hợp đồng") ??
    tenants[0] ??
    null;



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
    tenants,

    room,

    property

  };


}
