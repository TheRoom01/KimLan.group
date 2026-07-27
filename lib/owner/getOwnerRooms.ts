import {
  normalizeContractStatus,
  normalizeRoomStatus,
  type ContractStatus,
  type RoomStatus,
} from "@/lib/owner/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UPCOMING_ROOM_DAYS = 30;

function daysUntil(dateValue?: string | null): number | null {
  if (!dateValue) return null;

  const target = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil(
    (target.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

function contractPriority(status: ContractStatus | null): number {
  if (status === "Đang hiệu lực") return 0;
  if (status === "Chờ nhận phòng") return 1;
  return 2;
}

export async function getOwnerRooms() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("rooms")
    .select(`
      id,
      room_code,
      room_type,
      price,
      status,
      publish_status,
      lifecycle_status,
      property_id,
      properties!rooms_property_id_fkey (
        id,
        name,
        house_number,
        address,
        district,
        city
      ),
      rental_contracts (
        id,
        status,
        start_date,
        end_date,
        monthly_price,
        deposit_amount,
        created_at,
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
    .eq("lifecycle_status", "active")
    .order("room_code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((room: any) => {
    const contracts = [...(room.rental_contracts ?? [])]
      .filter((candidate: any) => {
        const status = normalizeContractStatus(candidate.status);
        return status === "Đang hiệu lực" || status === "Chờ nhận phòng";
      })
      .sort((left: any, right: any) => {
        const priorityDifference =
          contractPriority(normalizeContractStatus(left.status)) -
          contractPriority(normalizeContractStatus(right.status));

        if (priorityDifference !== 0) return priorityDifference;

        return String(right.created_at ?? "").localeCompare(
          String(left.created_at ?? ""),
        );
      });

    const contract = contracts[0] ?? null;
    const contractStatus = normalizeContractStatus(contract?.status);
    const storedStatus = normalizeRoomStatus(room.status) ?? "Đang trống";
    const daysRemaining = daysUntil(contract?.end_date);

    let displayStatus: RoomStatus = storedStatus;

    if (contractStatus === "Đang hiệu lực") {
      displayStatus =
        daysRemaining !== null &&
        daysRemaining >= 0 &&
        daysRemaining <= UPCOMING_ROOM_DAYS
          ? "Sắp trống"
          : "Đã thuê";
    } else if (contractStatus === "Chờ nhận phòng") {
      displayStatus = "Đã thuê";
    }

    const tenantRelation =
      contract?.contract_tenants?.find(
        (item: any) => item.role === "Chủ hợp đồng",
      ) ?? contract?.contract_tenants?.[0];

    const tenant = Array.isArray(tenantRelation?.tenants)
      ? tenantRelation.tenants[0]
      : tenantRelation?.tenants ?? null;

    const property = Array.isArray(room.properties)
      ? room.properties[0]
      : room.properties;

    return {
      ...room,
      status: storedStatus,
      displayStatus,
      daysRemaining,
      contract,
      tenant: tenant ? [tenant] : [],
      property,
    };
  });
}
