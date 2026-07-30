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
      chinh_sach,
      link_zalo,
      zalo_phone,
      google_maps_url,
      address,
      house_number,
      district,
      ward,
      lat,
      lng,
      property_id,
      lifecycle_status,
      publish_status,
      is_hidden,
      archived_at,
      room_details (
        id,
        electric_fee_value,
        electric_fee_unit,
        water_fee_value,
        water_fee_unit,
        service_fee_value,
        service_fee_unit,
        parking_fee_value,
        parking_fee_unit,
        other_fee_value,
        other_fee_note,
        has_elevator,
        has_stairs,
        shared_washer,
        private_washer,
        shared_dryer,
        private_dryer,
        has_parking,
        has_basement,
        fingerprint_lock,
        allow_pet,
        allow_cat,
        allow_dog,
        no_pet,
        short_term,
        long_term,
        other_amenities,
        detail_json
      ),
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
            cccd,
            cccd_front_path,
            cccd_back_path
          )
        )
      )
    `)
    .eq("id", roomId)
    .single();

  if (error) throw error;

  const media = [...(data.room_media ?? [])].sort(
    (left, right) =>
      Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
  );

  const contracts = [...(data.rental_contracts ?? [])].sort(
    (left, right) => {
      const statusDifference =
        contractPriority(normalizeContractStatus(left.status)) -
        contractPriority(normalizeContractStatus(right.status));

      if (statusDifference !== 0) return statusDifference;

      return String(right.created_at ?? "").localeCompare(
        String(left.created_at ?? ""),
      );
    },
  );

  const contract =
    contracts.find((candidate) => {
      const status = normalizeContractStatus(candidate.status);
      return status === "Đang hiệu lực" || status === "Chờ nhận phòng";
    }) ?? null;
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
  }

  const tenants = (contract?.contract_tenants ?? [])
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
  const detailsRelation = data.room_details;
  const details = Array.isArray(detailsRelation)
    ? detailsRelation[0] ?? null
    : detailsRelation ?? null;

  return {
    ...data,
    status: storedStatus,
    media,
    details,
    displayStatus,
    daysRemaining,
    contracts,
    contract,
    tenant,
    tenants,
  };
}
