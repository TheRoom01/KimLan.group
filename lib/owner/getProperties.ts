import { createSupabaseServerClient } from "../supabase/server";

const UPCOMING_CONTRACT_DAYS = 30;
const ACTIVE_CONTRACT_STATUSES = new Set(["active", "Đang hiệu lực"]);
const PENDING_CONTRACT_STATUSES = new Set(["pending", "Chờ nhận phòng"]);

type ContractReference = {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
};

function dateValue(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function selectCurrentContract(contracts: ContractReference[] | null | undefined) {
  return [...(contracts ?? [])]
    .filter((contract) => {
      const status = String(contract.status ?? "");
      return ACTIVE_CONTRACT_STATUSES.has(status) || PENDING_CONTRACT_STATUSES.has(status);
    })
    .sort((left, right) => {
      const leftActive = ACTIVE_CONTRACT_STATUSES.has(String(left.status ?? ""));
      const rightActive = ACTIVE_CONTRACT_STATUSES.has(String(right.status ?? ""));

      if (leftActive !== rightActive) return leftActive ? -1 : 1;

      return (
        dateValue(right.start_date) - dateValue(left.start_date) ||
        dateValue(right.created_at) - dateValue(left.created_at)
      );
    })[0];
}

export async function getProperties() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("property_members")
    .select(`
      role,
      status,
      properties!property_members_property_id_fkey (
        id,
        code,
        name,
        house_number,
        address,
        ward,
        district,
        city,
        cover_image,
        status,
        approval_status,
        lifecycle_status,
        created_at,
        property_members!property_members_property_id_fkey (
          id,
          status
        ),
        rooms!rooms_property_id_fkey (
          id,
          status,
          lifecycle_status,
          rental_contracts (
            status,
            start_date,
            end_date,
            created_at
          )
        )
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    console.error("[Owner] getProperties:", error);
    throw error;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? [])
    .map((membership) => {
      const property = Array.isArray(membership.properties)
        ? membership.properties[0]
        : membership.properties;

      if (!property) return null;

      let rentedRooms = 0;
      let emptyRooms = 0;
      let upcomingRooms = 0;
      const activeRooms = (property.rooms ?? []).filter(
        (room) => (room.lifecycle_status ?? "active") === "active",
      );

      for (const room of activeRooms) {
        const contract = selectCurrentContract(room.rental_contracts);
        const status = String(contract?.status ?? "");

        if (ACTIVE_CONTRACT_STATUSES.has(status)) {
          const endDate = contract?.end_date
            ? new Date(contract.end_date)
            : null;

          const diffDays = endDate
            ? Math.ceil(
                (endDate.getTime() - today.getTime()) /
                86_400_000,
              )
            : null;


          /**
           * Chỉ xem là sắp trống khi:
           * - Có hợp đồng active
           * - Có ngày hết hạn
           * - Còn <= 30 ngày
           * - Chưa hết hạn
           */
          if (
            diffDays !== null &&
            diffDays >= 0 &&
            diffDays <= UPCOMING_CONTRACT_DAYS
          ) {
            upcomingRooms += 1;
          } else {
            rentedRooms += 1;
          }

        } else if (
          PENDING_CONTRACT_STATUSES.has(status)
        ) {

          /**
           * Chờ nhận phòng vẫn tính đang thuê
           */
          rentedRooms += 1;

        } else {

          /**
           * Không có hợp đồng hiện tại
           */
          if (
            room.status === "Đã thuê"
          ) {
            rentedRooms += 1;

          } else {
            emptyRooms += 1;
          }
        }
      }

      return {
        ...property,

        membership_role:
          membership.role,


        member_count:
          property.property_members?.filter(
            (member) => member.status === "active",
          ).length ?? 1,


        total_rooms:
          activeRooms.length,


        rented_rooms:
          rentedRooms,


        empty_rooms:
          emptyRooms,


        upcoming_rooms:
          upcomingRooms,
        };

    })
    
    .filter(
      (property): property is NonNullable<typeof property> =>
        property !== null && property.lifecycle_status !== "archived",
    )
    .sort((left, right) => {
      const leftName =
      String(
        left.name ??
        left.code ??
        left.address ??
        "",
      );
      const rightName = String(right.name ?? right.code ?? right.address ?? "");
      return leftName.localeCompare(rightName, "vi");
    });
}
