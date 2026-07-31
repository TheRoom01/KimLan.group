export type RevenueMonth = {
  month: number;
  year: number;
};

export type RevenueDraft = RevenueMonth & {
  contract_id: string;
  deposit_amount: number;
  rent_amount: number;
  electricity_start: number;
  electricity_end: number;
  electricity_unit_price: number;
  parking_fee: number;
  service_fee: number;
  water_fee: number;
  other_fee: number;
  note?: string | null;
};

export type RevenueRecord = Omit<RevenueDraft, "month" | "year"> & {
  id: string;
  cycle_id: string;
  room_id: string;
  property_id: string;
  room_code: string | null;
  tenant_name: string | null;
  electricity_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: "pending" | "partial" | "paid";
  room_revenue_cycles?: RevenueMonth | RevenueMonth[] | null;
};
