import { createSupabaseServerClient } from "@/lib/supabase/server";

function firstRelation(value: unknown): unknown {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function relationId(value: unknown): string | null {
  const relation = firstRelation(value);
  const scalar = asString(relation);
  if (scalar) return scalar;

  if (relation && typeof relation === "object") {
    return asString((relation as Record<string, unknown>).id);
  }

  return null;
}

function contractPropertyId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  return asString(record.property_id) || relationId(record.property);
}

export async function getOwnerDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("property_members")
    .select("property_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("[Owner] getOwnerDashboard memberships:", membershipError);
    throw membershipError;
  }

  const propertyIds = [
    ...new Set(
      (memberships ?? [])
        .map((membership: any) => String(membership.property_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  if (propertyIds.length === 0) {
    return {
      summary: {
        total_properties: 0,
        total_rooms: 0,
        rented_rooms: 0,
        empty_rooms: 0,
        upcoming_rooms: 0,
      },
      recent_contracts: [],
      expiring_contracts: [],
    };
  }

  const [dashboardResult, roomsResult] = await Promise.all([
    supabase.rpc("get_owner_dashboard_v1", {
      p_attention_limit: 50,
      p_activity_limit: 50,
    }),
    supabase
      .from("rooms")
      .select("id, property_id, status, lifecycle_status")
      .in("property_id", propertyIds)
      .eq("lifecycle_status", "active"),
  ]);

  if (dashboardResult.error) {
    console.error("getOwnerDashboard error:", dashboardResult.error);
    throw dashboardResult.error;
  }

  if (roomsResult.error) {
    console.error("[Owner] getOwnerDashboard rooms:", roomsResult.error);
    throw roomsResult.error;
  }

  const propertyIdSet = new Set(propertyIds);
  const dashboard =
    dashboardResult.data && typeof dashboardResult.data === "object"
      ? (dashboardResult.data as Record<string, unknown>)
      : {};
  const rooms = roomsResult.data ?? [];

  const recentContracts = Array.isArray(dashboard.recent_contracts)
    ? dashboard.recent_contracts
        .filter((contract) => {
          const propertyId = contractPropertyId(contract);
          return propertyId !== null && propertyIdSet.has(propertyId);
        })
        .slice(0, 5)
    : [];

  const expiringContracts = Array.isArray(dashboard.expiring_contracts)
    ? dashboard.expiring_contracts
        .filter((contract) => {
          const propertyId = contractPropertyId(contract);
          return propertyId !== null && propertyIdSet.has(propertyId);
        })
        .slice(0, 5)
    : [];

  const summary = rooms.reduce(
    (result, room) => {
      const status = String(room.status ?? "Đang trống");

      result.total_rooms += 1;
      if (status === "Đã thuê") result.rented_rooms += 1;
      else if (status === "Sắp trống") result.upcoming_rooms += 1;
      else result.empty_rooms += 1;

      return result;
    },
    {
      total_properties: propertyIds.length,
      total_rooms: 0,
      rented_rooms: 0,
      empty_rooms: 0,
      upcoming_rooms: 0,
    },
  );

  return {
    ...dashboard,
    summary,
    recent_contracts: recentContracts,
    expiring_contracts: expiringContracts,
  };
}
