import { readApiResponse } from "@/lib/api/client";

import type { RevenueDraft, RevenueRecord } from "./types";

const REVENUE_ENDPOINT = "/api/owner/revenues";

export async function getContractRevenues(
  contractId: string,
): Promise<RevenueRecord[]> {
  const query = new URLSearchParams({ contract_id: contractId });
  return readApiResponse<RevenueRecord[]>(
    await fetch(`${REVENUE_ENDPOINT}?${query}`, { cache: "no-store" }),
  );
}

export async function createContractRevenue(
  input: RevenueDraft,
): Promise<RevenueRecord> {
  return readApiResponse<RevenueRecord>(
    await fetch(REVENUE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateContractRevenue(
  revenueId: string,
  input: Omit<RevenueDraft, "contract_id" | "month" | "year">,
): Promise<RevenueRecord> {
  return readApiResponse<RevenueRecord>(
    await fetch(REVENUE_ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, revenue_id: revenueId }),
    }),
  );
}
