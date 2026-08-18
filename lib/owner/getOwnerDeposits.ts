import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OwnerDeposit = {
  id: string;
  start_date: string;
  deposit_amount: number | null;
  booking_total_amount: number | null;
  booking_status: "holding" | "awaiting_checkin" | "checked_in" | "cancelled";
  room: { id: string; room_code: string | null } | null;
  property: { id: string; code: string | null; name: string | null; house_number: string | null; address: string | null } | null;
  tenant: { full_name: string; phone: string | null } | null;
};

export async function getOwnerDeposits(): Promise<OwnerDeposit[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rental_contracts")
    .select("id,start_date,deposit_amount,booking_total_amount,booking_status,rooms!inner(id,room_code,properties!rooms_property_id_fkey(id,code,name,house_number,address)),contract_tenants(role,tenants(full_name,phone))")
    .eq("contract_type", "deposit")
    .is("deleted_at", null)
    .order("start_date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    const property = Array.isArray(room?.properties) ? room.properties[0] : room?.properties;
    const relations = row.contract_tenants ?? [];
    const representative = relations.find((item) => item.role === "Chủ hợp đồng") ?? relations[0];
    const tenant = Array.isArray(representative?.tenants) ? representative.tenants[0] : representative?.tenants;
    return {
      id: row.id,
      start_date: row.start_date,
      deposit_amount: row.deposit_amount,
      booking_total_amount: row.booking_total_amount,
      booking_status: row.booking_status as OwnerDeposit["booking_status"],
      room: room ? { id: room.id, room_code: room.room_code } : null,
      property: property ? { id: property.id, code: property.code, name: property.name, house_number: property.house_number, address: property.address } : null,
      tenant: tenant ? { full_name: tenant.full_name, phone: tenant.phone } : null,
    };
  });
}
