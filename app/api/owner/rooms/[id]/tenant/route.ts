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
import { parseCreateOwnerContractInput } from "@/lib/owner/validation";
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
    const roomId = parseUuid(rawId, "room_id");
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
    const input = parseCreateOwnerContractInput(body);

    const { data, error } = await supabase.rpc(
      "create_owner_contract_v1",
      {
        p_room_id: roomId,
        p_full_name: input.full_name,
        p_phone: input.phone,
        p_cccd: input.cccd,
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_monthly_price: input.monthly_price,
        p_deposit_amount: input.deposit_amount,
      },
    );

    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) {
    return mapUnknownError(error);
  }
}
