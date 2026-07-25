import { createSupabaseServerClient } from "../supabase/server";
const UPCOMING_ROOM_DAYS = 30;

export async function getPropertyRooms(propertyId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("rooms")
    .select(`
      id,
      room_code,
      room_type,
      price,
      status,

      rental_contracts (
        id,
        status,
        start_date,
        end_date,

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
    .eq("property_id", propertyId)
    .order("room_code");

  if (error) throw error;

  const today = new Date();

const rooms =
  (data ?? []).map((room: any) => {

    const contract = room.rental_contracts?.[0];

    let displayStatus = room.status;

    if (contract?.status === "Đang hiệu lực") {

      const endDate = new Date(contract.end_date);

      const diffDays =
        Math.ceil(
          (endDate.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24)
        );

      if (diffDays <= UPCOMING_ROOM_DAYS) {
        displayStatus = "Sắp trống";
      } else {
        displayStatus = "Đã thuê";
      }

    }

    if (contract?.status === "Chờ nhận phòng") {
      displayStatus = "Đã thuê";
    }

    if (
      contract?.status === "Đã kết thúc" ||
      contract?.status === "Đã hủy" ||
      !contract
    ) {
      displayStatus = "Đang trống";
    }

    return {

      ...room,

      displayStatus,

      daysRemaining:
        contract?.end_date
          ? Math.ceil(
              (new Date(contract.end_date).getTime() -
                today.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null

    };

  });

return rooms;
}