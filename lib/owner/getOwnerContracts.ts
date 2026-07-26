import {
  createSupabaseServerClient
} from "@/lib/supabase/server";


export async function getOwnerContracts(){

  const supabase =
    await createSupabaseServerClient();



  const {
    data,
    error
  }
  =
  await supabase.rpc(
    "get_owner_contracts_v1"
  );



  if(error){

    throw error;

  }



  return data ?? [];

}