import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params; const contractId=parseUuid(id,"contract_id");
    const supabase=await createSupabaseServerClient();
    if(!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED","Bạn cần đăng nhập",401);
    const {data,error}=await supabase.rpc("trash_owner_contract_v1",{p_contract_id:contractId});
    if(error)return mapDatabaseError(error); return apiSuccess(data);
  } catch(error){return mapUnknownError(error);}
}
