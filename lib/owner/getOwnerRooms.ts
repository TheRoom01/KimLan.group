import {
  normalizeContractStatus,
  normalizeRoomStatus,
  type ContractStatus,
  type RoomStatus,
} from "@/lib/owner/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

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
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("property_members")
    .select("property_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("[Owner] getOwnerRooms memberships:", membershipError);
    throw membershipError;
  }

  const propertyIds = [
    ...new Set(
      (memberships ?? [])
        .map((membership) => String(membership.property_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const membershipRoleByProperty = new Map(
    (memberships ?? []).map((membership) => [
      String(membership.property_id),
      String(membership.role ?? "viewer"),
    ]),
  );

  if (propertyIds.length === 0) return [];

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
        code,
        name,
        house_number,
        address,
        ward,
        district,
        city,
        cover_image
      ),
      rental_contracts (
        id,
        status,
        start_date,
        end_date,
        created_at,
        contract_tenants (
          role,
          tenants (
            id,
            full_name,
            phone
          )
        )
      )
    `)
    .in("property_id", propertyIds)
    .eq("lifecycle_status", "active")
    .order("room_code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((room) => {
    const contracts = [...(room.rental_contracts ?? [])]
      .filter((candidate) => {
        const status = normalizeContractStatus(candidate.status);
        return status === "Đang hiệu lực" || status === "Chờ nhận phòng";
      })
      .sort((left, right) => {
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

    const tenants = (contract?.contract_tenants ?? [])
      .map((relation) => {
        const tenant = Array.isArray(relation.tenants)
          ? relation.tenants[0]
          : relation.tenants;

        return tenant ? { ...tenant, role: relation.role ?? null } : null;
      })
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null,
      );

    const tenant = tenants.find(
      (candidate) => candidate?.role === "Chủ hợp đồng",
    ) ?? tenants[0] ?? null;

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
      tenants,
      property,
      membership_role: membershipRoleByProperty.get(String(room.property_id)) ?? "viewer",
      can_manage: ["owner", "manager"].includes(
        membershipRoleByProperty.get(String(room.property_id)) ?? "viewer",
      ),
    };
  });
}
