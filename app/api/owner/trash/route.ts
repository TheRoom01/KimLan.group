import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError,apiSuccess,mapDatabaseError,mapUnknownError } from "@/lib/api/response";
import { parseUuid,readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(){try{const s=await createSupabaseServerClient();const user=await getAuthenticatedUser(s);if(!user)return apiError("UNAUTHENTICATED","Bạn cần đăng nhập",401);
 const {data:m,error:me}=await s.from("property_members").select("property_id").eq("user_id",user.id).eq("status","active");if(me)return mapDatabaseError(me);const ids=(m??[]).map(x=>x.property_id);if(!ids.length)return apiSuccess([]);
 const [{data:rooms,error:re},{data:contracts,error:ce}]=await Promise.all([
  s.from("rooms").select("id,room_code,archived_at,property_id,properties!rooms_property_id_fkey(house_number,address,district)").in("property_id",ids).eq("lifecycle_status","archived").order("archived_at",{ascending:false}),
  s.from("rental_contracts").select("id,deleted_at,purge_after,rooms!inner(room_code,property_id),contract_tenants(role,tenants(full_name))").in("rooms.property_id",ids).not("deleted_at","is",null).order("deleted_at",{ascending:false})]);
 if(re)return mapDatabaseError(re);if(ce)return mapDatabaseError(ce);
 return apiSuccess([...(rooms??[]).map(x=>({type:"room",...x,deleted_at:x.archived_at,purge_after:x.archived_at?new Date(new Date(x.archived_at).getTime()+20*86400000).toISOString():null})),...(contracts??[]).map(x=>({type:"contract",...x}))]);
}catch(e){return mapUnknownError(e);}}

export async function POST(request:Request){try{const s=await createSupabaseServerClient();if(!await getAuthenticatedUser(s))return apiError("UNAUTHENTICATED","Bạn cần đăng nhập",401);const b=await readJsonObject(request);const type=String(b.type);if(type!=="room"&&type!=="contract")return apiError("INVALID_INPUT","Loại dữ liệu không hợp lệ",400);const id=parseUuid(b.id,"id");const {data,error}=await s.rpc("restore_owner_trash_v1",{p_entity_type:type,p_entity_id:id});if(error)return mapDatabaseError(error);return apiSuccess(data);}catch(e){return mapUnknownError(e);}}
