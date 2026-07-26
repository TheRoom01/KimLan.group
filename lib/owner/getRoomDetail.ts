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
      description,
      address,
      house_number,
      district,
      ward,
      property_id,
      room_media (
        id,
        type,
        provider,
        url,
        path,
        is_cover,
        sort_order,
        created_at
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
    .eq("id", roomId)
    .single();

  if (error) throw error;

  const media = [...(data.room_media ?? [])].sort(
    (left: any, right: any) =>
      Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
  );

  const contracts = [...(data.rental_contracts ?? [])].sort(
    (left: any, right: any) => {
      const statusDifference =
        contractPriority(normalizeContractStatus(left.status)) -
        contractPriority(normalizeContractStatus(right.status));

      if (statusDifference !== 0) return statusDifference;

      return String(right.created_at ?? "").localeCompare(
        String(left.created_at ?? ""),
      );
    },
  );

  const contract = contracts[0] ?? null;
  const contractStatus = normalizeContractStatus(contract?.status);
  const storedStatus = normalizeRoomStatus(data.status) ?? "Đang trống";
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
  } else if (contractStatus === "Đã kết thúc" || contractStatus === "Đã hủy") {
    displayStatus = storedStatus;
  }

  const tenantRelation =
    contract?.contract_tenants?.find(
      (item: any) => item.role === "Chủ hợp đồng",
    ) ?? contract?.contract_tenants?.[0];

  const tenant = Array.isArray(tenantRelation?.tenants)
    ? tenantRelation.tenants[0]
    : tenantRelation?.tenants ?? null;

  return {
    ...data,
    status: storedStatus,
    media,
    displayStatus,
    daysRemaining,
    contracts,
    contract,
    tenant,
  };
}
