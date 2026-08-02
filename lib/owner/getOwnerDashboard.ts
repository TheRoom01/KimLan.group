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
      current_month_total_revenue: 0,
    };
  }

  const monthParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date());
  const currentMonth = Number(
    monthParts.find((part) => part.type === "month")?.value,
  );
  const currentYear = Number(
    monthParts.find((part) => part.type === "year")?.value,
  );

  const [dashboardResult, roomsResult, revenueResult] = await Promise.all([
    supabase.rpc("get_owner_dashboard_v1", {
      p_attention_limit: 50,
      p_activity_limit: 50,
    }),
    supabase
      .from("rooms")
      .select("id, property_id, status, lifecycle_status")
      .in("property_id", propertyIds)
      .eq("lifecycle_status", "active"),
    supabase
      .from("room_monthly_revenues")
      .select("total_amount, room_revenue_cycles!inner(month, year)")
      .in("property_id", propertyIds)
      .eq("room_revenue_cycles.month", currentMonth)
      .eq("room_revenue_cycles.year", currentYear),
  ]);

  if (dashboardResult.error) {
    console.error("getOwnerDashboard error:", dashboardResult.error);
    throw dashboardResult.error;
  }

  if (roomsResult.error) {
    console.error("[Owner] getOwnerDashboard rooms:", roomsResult.error);
    throw roomsResult.error;
  }

  if (revenueResult.error) {
    console.error("[Owner] getOwnerDashboard revenues:", revenueResult.error);
    throw revenueResult.error;
  }

  const propertyIdSet = new Set(propertyIds);
  const dashboard =
    dashboardResult.data && typeof dashboardResult.data === "object"
      ? (dashboardResult.data as Record<string, unknown>)
      : {};
  const rooms = roomsResult.data ?? [];

  const recentContractCandidates = Array.isArray(dashboard.recent_contracts)
    ? dashboard.recent_contracts.filter((contract) => {
        const propertyId = contractPropertyId(contract);
        return propertyId !== null && propertyIdSet.has(propertyId);
      })
    : [];
  const recentContractIds = recentContractCandidates
    .map((contract) =>
      contract && typeof contract === "object"
        ? asString((contract as Record<string, unknown>).id)
        : null,
    )
    .filter((id): id is string => Boolean(id));

  let activeRecentContractIds = new Set<string>();
  if (recentContractIds.length > 0) {
    const { data: activeContracts, error: activeContractsError } = await supabase
      .from("rental_contracts")
      .select("id")
      .in("id", recentContractIds)
      .in("status", ["active", "Đang hiệu lực"])
      .is("deleted_at", null);

    if (activeContractsError) {
      console.error(
        "[Owner] getOwnerDashboard active recent contracts:",
        activeContractsError,
      );
      throw activeContractsError;
    }
    activeRecentContractIds = new Set(
      (activeContracts ?? []).map((contract) => contract.id),
    );
  }

  const recentContracts = recentContractCandidates
    .filter((contract) => {
      if (!contract || typeof contract !== "object") return false;
      const id = asString((contract as Record<string, unknown>).id);
      return id !== null && activeRecentContractIds.has(id);
    })
    .slice(0, 5);

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

  const currentMonthTotalRevenue = (revenueResult.data ?? []).reduce(
    (total, revenue) => total + Number(revenue.total_amount ?? 0),
    0,
  );

  return {
    ...dashboard,
    summary,
    recent_contracts: recentContracts,
    expiring_contracts: expiringContracts,
    current_month_total_revenue: Number.isFinite(currentMonthTotalRevenue)
      ? currentMonthTotalRevenue
      : 0,
  };
}
