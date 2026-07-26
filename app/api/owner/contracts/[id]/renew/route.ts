import { getAuthenticatedUser } from "@/lib/api/auth";
import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseUuid,
  readJsonObject,
} from "@/lib/api/validation";
import { parseRenewOwnerContractInput } from "@/lib/owner/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const contractId = parseUuid(rawId, "contract_id");
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return apiError(
        "UNAUTHENTICATED",
        "Bạn cần đăng nhập để thực hiện thao tác này",
        401,
      );
    }

    const body = await readJsonObject(request);
    const input = parseRenewOwnerContractInput(body);

    const { data, error } = await supabase.rpc(
      "renew_owner_contract_v1",
      {
        p_contract_id: contractId,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_monthly_price: input.monthly_price,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data);
  } catch (error) {
    return mapUnknownError(error);
  }
}
