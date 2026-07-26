import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getTenantDetail(
  tenantId:string
){

  const supabase =
    await createSupabaseServerClient();


  const {
    data,
    error
  } =
  await supabase.rpc(
    "get_owner_tenant_detail_v1",
    {
      p_tenant_id: tenantId
    }
  );


  if(error){

    throw error;

  }


  if(!data){

    return null;

  }


  return {

    tenant:
      data.tenant ?? null,


    activeContract:
      data.active_contract ?? null,


    contracts:
      data.contracts ?? []

  };

}