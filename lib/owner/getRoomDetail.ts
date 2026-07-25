import { createSupabaseServerClient } from "../supabase/server";

const UPCOMING_ROOM_DAYS = 30;

export async function getRoomDetail(roomId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("rooms")
    .select(`
      id,
      room_code,
      room_type,
      price,
      status,
      address,
      district,
      ward,
      property_id,

      rental_contracts (
        id,
        status,
        start_date,
        end_date,
        monthly_price,
        deposit_amount,

        contract_tenants (
          role,

          tenants (
            id,
            full_name,
            phone,
            cccd
          )
        )
      )
    `)
    .eq("id", roomId)
    .single();

  if (error) throw error;

  const today = new Date();

  const contract = data.rental_contracts?.[0];

  let displayStatus = data.status;
  let daysRemaining: number | null = null;

  if (contract) {

    if (contract.end_date) {

      daysRemaining = Math.ceil(
        (new Date(contract.end_date).getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
      );

    }

    if (contract.status === "Đang hiệu lực") {

      if (
        daysRemaining !== null &&
        daysRemaining >= 0 &&
        daysRemaining <= UPCOMING_ROOM_DAYS
      ) {

        displayStatus = "Sắp trống";

      } else {

        displayStatus = "Đã thuê";

      }

    }

    if (contract.status === "Chờ nhận phòng") {

      displayStatus = "Đã thuê";

    }

    if (
      contract.status === "Đã kết thúc" ||
      contract.status === "Đã hủy"
    ) {

      displayStatus = "Đang trống";

    }

  } else {

    displayStatus = "Đang trống";

  }

  const tenantRelation =
    contract?.contract_tenants?.find(
        (x: any) => x.role === "Chủ hợp đồng"
    ) ??
    contract?.contract_tenants?.[0];

    const tenant = Array.isArray(tenantRelation?.tenants)
    ? tenantRelation.tenants[0]
    : tenantRelation?.tenants ?? null;

  return {
    ...data,
    displayStatus,
    daysRemaining,
    contract,
    tenant,
  };
}
